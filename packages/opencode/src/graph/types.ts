/**
 * Graph Engine domain types.
 *
 * A graph run is a persisted DAG of subagent tasks:
 *   - nodes carry a self-contained task plus explicit dependencies
 *   - every node executes as an independent subagent (process-level RLM)
 *   - outputs flow downstream through `dependsOn`
 *   - state persists to disk, so long-horizon runs survive restarts
 *
 * @module graph/types
 */

export type GraphNodeState = "pending" | "running" | "done" | "failed" | "skipped"

export type GraphStatus = "planned" | "running" | "done" | "partial" | "failed"

/** How a node executes. "agent" = chat subagent, "sim" = /sim world agent. */
export type GraphNodeKind = "agent" | "sim"

/** A node as produced by the LLM planner (before execution state). */
export interface GraphPlanNode {
  readonly id: string
  readonly task: string
  readonly dependsOn?: string[]
  readonly kind?: GraphNodeKind
}

/** The LLM-produced plan: a DAG of nodes. */
export interface GraphPlan {
  readonly nodes: GraphPlanNode[]
}

/** A node with execution state. */
export interface GraphNode {
  readonly id: string
  readonly task: string
  readonly kind: GraphNodeKind
  readonly dependsOn: readonly string[]
  state: GraphNodeState
  output?: string
  error?: string
  retries: number
  readonly maxRetries: number
  startedAt?: string
  finishedAt?: string
}

/** A full persisted graph run. */
export interface GraphRun {
  readonly id: string
  readonly task: string
  status: GraphStatus
  readonly maxNodes: number
  readonly createdAt: string
  updatedAt: string
  readonly nodes: GraphNode[]
  /** Final synthesis produced after execution. */
  output?: string
}

export interface GraphRunOpts {
  readonly maxNodes?: number
  readonly maxRetries?: number
  readonly concurrency?: number
  readonly timeoutMs?: number
  /** Progress callback after each node finishes. */
  readonly onNode?: (node: GraphNode, index: number, total: number) => void
}
