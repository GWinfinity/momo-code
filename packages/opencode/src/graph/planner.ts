/**
 * Graph Engine — LLM DAG planner.
 *
 * Turns a long-horizon task into a dependency graph of self-contained
 * subagent tasks. Degrades gracefully: an unusable plan is retried once
 * with corrective feedback, then falls back to a single node.
 *
 * @module graph/planner
 */

import { chatComplete, resolveProviderConfig } from "../cli/chat.js"
import { extractJsonObject } from "../refine/propose.js"
import { parseGraphPlan, validatePlan, singleNodePlan } from "./parse.js"
import type { GraphPlan } from "./types.js"

const PLANNER_SYSTEM = `You are a graph planner for an autonomous multi-agent system.

Decompose the given long-horizon task into a DIRECTED ACYCLIC GRAPH (DAG)
of nodes. Every node will be executed by an independent subagent that
cannot see this conversation — each node's task must be fully
self-contained (state what to do, what files to touch, what to verify).

Rules:
- Prefer staged, dependency-ordered work: research/design first, then
  implementation, then verification/integration, and a final synthesis
  node when useful.
- Use "dependsOn" ONLY for real data/artifact dependencies (a node needs
  the OUTPUT of another node).
- Each node task should name concrete deliverables so its result is
  verifiable.
- Keep the graph small (at most {maxNodes} nodes). Do not over-decompose.
- IDs must be short unique slugs like "research", "design", "implement-a".
- OPTIONALLY set "kind": "sim" on a node whose work requires running a
  physics simulation in the Genesis world (the node then becomes a
  simulation agent). Default kind is "agent" (a normal coding/chat agent).

Respond with ONLY a JSON object (no prose, no fences):
{"nodes": [{"id": "a", "task": "self-contained task", "dependsOn": ["b"], "kind": "agent"}, ...]}`

/**
 * Ask the model for a DAG plan. Never throws — returns a usable plan or
 * the single-node fallback.
 */
export async function planTask(
  task: string,
  maxNodes: number,
): Promise<GraphPlan> {
  const provider = await resolveProviderConfig()
  if (!provider || !provider.baseUrl) {
    // No LLM — degrade to direct single-node execution.
    return singleNodePlan(task)
  }

  const call = (userMsg: string) =>
    chatComplete({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      system: PLANNER_SYSTEM.replace("{maxNodes}", String(maxNodes)),
      messages: [{ role: "user", content: userMsg }],
      stream: false,
      temperature: 0.3,
      timeout: 180_000,
    })

  const attempt = async (userMsg: string): Promise<GraphPlan | null> => {
    const reply = await call(userMsg)
    const plan = parseGraphPlan(extractJsonObject(reply))
    if (!plan) return null
    const errors = validatePlan(plan)
    if (errors.length > 0) {
      throw new Error(errors.join("; "))
    }
    if (plan.nodes.length > maxNodes) {
      throw new Error(`plan has ${plan.nodes.length} nodes (max ${maxNodes})`)
    }
    return plan
  }

  try {
    const plan = await attempt(`Task:\n${task}`)
    if (plan) return plan
  } catch (firstErr) {
    // One corrective retry with the validation error, then fall back.
    try {
      const correction =
        `Task:\n${task}\n\nYour previous reply was rejected: ` +
        `${firstErr instanceof Error ? firstErr.message : String(firstErr)}. ` +
        `Reply with ONLY the corrected JSON DAG (respect max {maxNodes} nodes).`
      const plan = await attempt(correction)
      if (plan) return plan
    } catch {
      // fall through to single-node fallback
    }
  }

  return singleNodePlan(task)
}
