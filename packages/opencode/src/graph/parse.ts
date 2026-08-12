/**
 * Graph Engine — pure graph logic (unit-tested, no I/O).
 *
 * Parses and validates LLM-produced plans, computes topological levels
 * for parallel batch execution, and derives which nodes are ready /
 * blocked / complete.
 *
 * @module graph/parse
 */

import type { GraphNode, GraphNodeKind, GraphPlan, GraphPlanNode, GraphStatus } from "./types.js"

// ---------------------------------------------------------------------------
// Plan parsing
// ---------------------------------------------------------------------------

/**
 * Parse and normalize a raw LLM plan into a GraphPlan.
 * Returns null when the payload is unusable (missing/empty nodes).
 */
export function parseGraphPlan(raw: unknown): GraphPlan | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as { nodes?: unknown }
  if (!Array.isArray(obj.nodes)) return null

  const nodes: GraphPlanNode[] = []
  for (const n of obj.nodes) {
    if (!n || typeof n !== "object") continue
    const rec = n as { id?: unknown; task?: unknown; dependsOn?: unknown; kind?: unknown }
    if (typeof rec.id !== "string" || !rec.id.trim()) continue
    if (typeof rec.task !== "string" || !rec.task.trim()) continue
    const deps = Array.isArray(rec.dependsOn)
      ? rec.dependsOn
          .filter((d): d is unknown => typeof d === "string" && d.trim().length > 0)
          .map((d) => (d as string).trim())
      : undefined
    const kind: GraphNodeKind | undefined =
      rec.kind === "sim" ? "sim" : undefined
    nodes.push({
      id: rec.id.trim(),
      task: rec.task.trim(),
      ...(kind ? { kind } : {}),
      ...(deps && deps.length > 0 ? { dependsOn: deps } : {}),
    })
  }
  return nodes.length > 0 ? { nodes } : null
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a plan is a well-formed DAG. Returns a list of errors
 * (empty when valid). Checks: duplicate ids, unknown deps, self-deps,
 * and cycles.
 */
export function validatePlan(plan: GraphPlan): string[] {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const n of plan.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id "${n.id}"`)
    ids.add(n.id)
  }

  for (const n of plan.nodes) {
    if ((n.dependsOn ?? []).includes(n.id)) {
      errors.push(`node "${n.id}" depends on itself`)
    }
    for (const d of n.dependsOn ?? []) {
      if (!ids.has(d)) errors.push(`node "${n.id}" depends on unknown node "${d}"`)
    }
  }

  // Cycle detection (DFS over the dependency graph)
  const byId = new Map(plan.nodes.map((n) => [n.id, n]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    const node = byId.get(id)
    if (node) {
      for (const d of node.dependsOn ?? []) {
        if (hasCycle(d)) return true
      }
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  for (const n of plan.nodes) {
    if (hasCycle(n.id)) {
      errors.push(`cycle detected in graph (around "${n.id}")`)
      break
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Topological levels
// ---------------------------------------------------------------------------

/**
 * Compute longest-path levels for the DAG: every node sits one level above
 * its deepest dependency, so nodes in the same level can run in parallel.
 * Assumes the plan is already validated (no cycles).
 */
export function topologicalLevels(plan: GraphPlan): string[][] {
  const level = new Map<string, number>()
  for (const n of plan.nodes) level.set(n.id, 0)

  // Fixpoint relaxation — terminates because the graph is acyclic.
  for (let i = 0; i <= plan.nodes.length; i++) {
    let changed = false
    for (const n of plan.nodes) {
      for (const d of n.dependsOn ?? []) {
        const candidate = (level.get(d) ?? 0) + 1
        if ((level.get(n.id) ?? 0) < candidate) {
          level.set(n.id, candidate)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  const out: string[][] = []
  for (const n of plan.nodes) {
    const l = level.get(n.id) ?? 0
    ;(out[l] ??= []).push(n.id)
  }
  return out
}

// ---------------------------------------------------------------------------
// Execution state derivation
// ---------------------------------------------------------------------------

/** Nodes that can run right now: pending with all dependencies done. */
export function readyNodes(nodes: readonly GraphNode[]): GraphNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes.filter((n) => {
    if (n.state !== "pending") return false
    return (n.dependsOn ?? []).every((d) => byId.get(d)?.state === "done")
  })
}

/** Pending nodes whose dependencies failed/skipped — they can never run. */
export function blockedNodes(nodes: readonly GraphNode[]): GraphNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes.filter((n) => {
    if (n.state !== "pending") return false
    return (n.dependsOn ?? []).some((d) => {
      const dep = byId.get(d)
      return dep?.state === "failed" || dep?.state === "skipped"
    })
  })
}

/** Is every node in a terminal state? */
export function isTerminal(nodes: readonly GraphNode[]): boolean {
  if (nodes.length === 0) return true
  return nodes.every((n) =>
    n.state === "done" || n.state === "failed" || n.state === "skipped"
  )
}

/** Overall run status from node states. */
export function computeStatus(nodes: readonly GraphNode[]): GraphStatus {
  if (nodes.length === 0) return "planned"
  if (!isTerminal(nodes)) return "running"
  if (nodes.some((n) => n.state === "failed" || n.state === "skipped")) {
    return nodes.some((n) => n.state === "done") ? "partial" : "failed"
  }
  return "done"
}

// ---------------------------------------------------------------------------
// Run construction
// ---------------------------------------------------------------------------

/** Single-node fallback plan (direct execution when planning fails). */
export function singleNodePlan(task: string): GraphPlan {
  return { nodes: [{ id: "n1", task }] }
}

/** Convert a validated plan into run nodes with initial state. */
export function planToNodes(
  plan: GraphPlan,
  maxRetries: number,
): GraphNode[] {
  return plan.nodes.map((n) => ({
    id: n.id,
    task: n.task,
    kind: n.kind ?? "agent",
    dependsOn: n.dependsOn ?? [],
    state: "pending",
    retries: 0,
    maxRetries,
  }))
}
