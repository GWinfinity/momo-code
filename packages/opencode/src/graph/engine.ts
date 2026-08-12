/**
 * Graph Engine — DAG executor over process-level subagents.
 *
 * Execution model:
 *   1. Plan a DAG of self-contained subagent tasks (LLM planner).
 *   2. Execute topologically: every batch of ready nodes runs as child
 *      `momo` processes in parallel (capped by concurrency), with the
 *      outputs of dependency nodes passed in as context.
 *   3. Failed nodes retry (maxRetries), then nodes blocked by failed
 *      dependencies are skipped; a final LLM pass synthesizes the report.
 *   4. State persists after every batch — `momo /graph resume <id>`
 *      continues a long-horizon run where it stopped.
 *
 * @module graph/engine
 */

import { spawnSubagent } from "../subagent/spawn.js"
import { chatComplete, resolveProviderConfig } from "../cli/chat.js"
import { blockedNodes, computeStatus, isTerminal, planToNodes, readyNodes } from "./parse.js"
import { planTask } from "./planner.js"
import { loadRun, newRunId, saveRun } from "./store.js"
import type { GraphNode, GraphRun, GraphRunOpts } from "./types.js"

// ---------------------------------------------------------------------------
// Defaults & env rails
// ---------------------------------------------------------------------------

function defaultMaxNodes(): number {
  return Number(process.env.MOMO_GRAPH_MAX_NODES || 12) || 12
}

function defaultMaxRetries(): number {
  return Number(process.env.MOMO_GRAPH_MAX_RETRIES || 2) || 2
}

function defaultConcurrency(): number {
  const budget = Number(process.env.MOMO_RLM_BUDGET || 4) || 4
  const graph = Number(process.env.MOMO_GRAPH_CONCURRENCY || budget) || budget
  return Math.min(graph, 8)
}

function defaultTimeoutMs(): number {
  return Number(process.env.MOMO_RLM_TIMEOUT_MS || 300_000) || 300_000
}

// ---------------------------------------------------------------------------
// Single node execution
// ---------------------------------------------------------------------------

async function runNode(node: GraphNode, run: GraphRun, timeoutMs: number): Promise<void> {
  const deps = run.nodes.filter((d) => node.dependsOn.includes(d.id))
  const context = deps
    .filter((d) => d.state === "done" && d.output)
    .map((d) => `--- dependency "${d.id}": ${d.task} ---\n${(d.output ?? "").slice(0, 4000)}`)
    .join("\n\n")

  let prompt = context
    ? `Graph task: ${run.task}\n\nDependency results:\n${context}\n\nYour node task:\n${node.task}`
    : node.task

  // sim nodes dispatch to the /sim world agent instead of a chat subagent
  const spawnArgs = node.kind === "sim" ? ["/sim", "run", prompt, "--json"] : undefined

  let lastError = ""
  for (let attempt = 0; attempt <= node.maxRetries; attempt++) {
    const result = await spawnSubagent(prompt, {
      timeoutMs,
      ...(spawnArgs ? { args: spawnArgs } : {}),
    })
    node.retries = attempt + 1
    if (result.exitCode === 0 && result.output.trim().length > 0) {
      node.output = result.output
      node.state = "done"
      node.finishedAt = new Date().toISOString()
      return
    }
    lastError = result.timedOut
      ? `subagent timed out after ${Math.round(timeoutMs / 1000)}s`
      : result.output.trim().slice(0, 500) ||
        `subagent exited with code ${result.exitCode}`
    if (attempt < node.maxRetries) {
      prompt =
        `${prompt}\n\n[retry ${attempt + 1}/${node.maxRetries}] ` +
        `Previous attempt failed: ${lastError}\nFix the approach and try again.`
    }
  }

  node.state = "failed"
  node.error = lastError
  node.finishedAt = new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Execution loop
// ---------------------------------------------------------------------------

/** Execute all pending nodes of a run, persisting after every batch. */
export async function executeGraph(
  run: GraphRun,
  opts: GraphRunOpts = {},
): Promise<void> {
  const concurrency = opts.concurrency ?? defaultConcurrency()
  const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs()
  const total = run.nodes.length
  let guard = 0

  // A resumed run may have crashed mid-batch: reset interrupted nodes
  // so they can be re-executed (they never produced a result).
  for (const n of run.nodes) {
    if (n.state === "running") {
      n.state = "pending"
      n.startedAt = undefined
    }
  }

  run.status = "running"
  run.updatedAt = new Date().toISOString()
  saveRun(run)

  while (!isTerminal(run.nodes)) {
    // Nodes blocked by failed dependencies can never run — skip them.
    for (const n of blockedNodes(run.nodes)) {
      n.state = "skipped"
      n.error = "blocked by failed dependency"
      n.finishedAt = new Date().toISOString()
    }

    const batch = readyNodes(run.nodes).slice(0, concurrency)
    if (batch.length === 0) break

    for (const n of batch) {
      n.state = "running"
      n.startedAt = new Date().toISOString()
    }
    saveRun(run)

    await Promise.all(batch.map((n) => runNode(n, run, timeoutMs)))
    run.updatedAt = new Date().toISOString()
    saveRun(run)

    for (const n of batch) {
      const idx = run.nodes.findIndex((x) => x.id === n.id)
      opts.onNode?.(n, idx === -1 ? 0 : idx, total)
    }

    if (++guard > run.nodes.length + 2) break // safety against pathological loops
  }

  run.status = computeStatus(run.nodes)
  run.updatedAt = new Date().toISOString()
  saveRun(run)
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

const SYNTH_SYSTEM = `You are the synthesizer of a multi-agent graph run.
Merge the node results below into one coherent final answer for the
original task. Be concise and concrete (code, decisions, findings).
Explicitly note any failed or skipped nodes instead of hiding them.`

function joinedOutput(run: GraphRun): string {
  return run.nodes
    .map((n) => {
      const head = `--- node ${n.id}: ${n.task} [${n.state}] ---`
      const body = n.output ? n.output.slice(0, 4000) : n.error ?? "(no output)"
      return `${head}\n${body}`
    })
    .join("\n\n")
}

/** Produce the final report from node outputs (LLM with fallback). */
export async function synthesizeRun(
  run: GraphRun,
  _opts: GraphRunOpts = {},
): Promise<string> {
  const done = run.nodes.filter((n) => n.state === "done" && n.output)
  if (done.length === 0) {
    const failures = run.nodes
      .filter((n) => n.error)
      .map((n) => `- ${n.id}: ${n.error}`)
      .join("\n")
    return failures ? `No nodes succeeded:\n${failures}` : "No nodes succeeded."
  }

  const provider = await resolveProviderConfig()
  if (!provider || !provider.baseUrl) return joinedOutput(run)

  const evidence = run.nodes
    .map((n) => {
      const status = n.state === "done" ? "ok" : n.error ?? n.state
      return `--- node ${n.id}: ${n.task} [${status}] ---\n${(n.output ?? "").slice(0, 3000)}`
    })
    .join("\n\n")

  try {
    return await chatComplete({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      system: SYNTH_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Original task:\n${run.task}\n\nNode results:\n${evidence}`,
        },
      ],
      stream: false,
      temperature: 0.3,
      timeout: 180_000,
    })
  } catch {
    return joinedOutput(run)
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Plan + execute + synthesize a new long-horizon graph run. */
export async function runGraph(
  task: string,
  opts: GraphRunOpts = {},
): Promise<GraphRun> {
  const maxNodes = opts.maxNodes ?? defaultMaxNodes()
  const maxRetries = opts.maxRetries ?? defaultMaxRetries()

  const plan = await planTask(task, maxNodes)
  const now = new Date().toISOString()
  const run: GraphRun = {
    id: newRunId(),
    task,
    status: "planned",
    maxNodes,
    createdAt: now,
    updatedAt: now,
    nodes: planToNodes(plan, maxRetries),
  }
  saveRun(run)

  await executeGraph(run, opts)
  run.output = await synthesizeRun(run, opts)
  run.updatedAt = new Date().toISOString()
  saveRun(run)
  return run
}

/** Resume a persisted run: execute remaining nodes + re-synthesize. */
export async function resumeGraph(
  id: string,
  opts: GraphRunOpts = {},
): Promise<GraphRun | null> {
  const run = loadRun(id)
  if (!run) return null

  await executeGraph(run, opts)
  run.output = await synthesizeRun(run, opts)
  run.updatedAt = new Date().toISOString()
  saveRun(run)
  return run
}
