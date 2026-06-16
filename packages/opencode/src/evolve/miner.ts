/**
 * Diagnosis: Mine signals from session DB and cluster failure patterns.
 *
 * Extracts coding-specific signals from agent work trajectories:
 * - Test pass/fail (strong, objective)
 * - Compile/type/lint errors (strong)
 * - Edit accepted/rejected (strong)
 * - User corrections (strong negative)
 * - Retry counts → confusion clusters
 *
 * Reference: Pioneer Agent §2.1 — "Mining advantage signals from agent work logs"
 */
import { Effect, Schema } from "effect"
import { Store } from "./store"

export interface Session {
  readonly id: string
  readonly messages: ReadonlyArray<Message>
  readonly tools: ReadonlyArray<ToolCall>
  readonly createdAt: number
}

export interface Message {
  readonly role: "user" | "assistant" | "system"
  readonly content: string
  readonly timestamp: number
}

export interface ToolCall {
  readonly tool: string
  readonly input: unknown
  readonly output: unknown
  readonly accepted: boolean
  readonly exitCode?: number
  readonly retries: number
}

export interface ConfusionCluster {
  readonly name: string           // e.g., "missing-import"
  readonly count: number          // Number of instances
  readonly avgRetries: number
  readonly signals: ReadonlyArray<Signal>
  readonly fixable: boolean       // Can be addressed via training
  readonly category: "syntax" | "semantic" | "api-usage" | "logic" | "external"
}

export interface Signal {
  readonly sessionId: string
  readonly toolCallId: string
  readonly type: "test-fail" | "compile-error" | "lint-error" | "user-correction" | "rejected-edit" | "retry-loop"
  readonly severity: "high" | "medium" | "low"
  readonly context: string
  readonly correction?: string
}

export interface Taxonomy {
  readonly clusters: ReadonlyArray<ConfusionCluster>
  readonly totalSessions: number
  readonly totalSignals: number
  readonly fixableRatio: number
}

/**
 * Schema for validated confusion clusters.
 */
export const ConfusionClusterSchema = Schema.Struct({
  name: Schema.String,
  count: Schema.Number,
  avgRetries: Schema.Number,
  signals: Schema.Array(
    Schema.Struct({
      sessionId: Schema.String,
      toolCallId: Schema.String,
      type: Schema.Literal("test-fail", "compile-error", "lint-error", "user-correction", "rejected-edit", "retry-loop"),
      severity: Schema.Literal("high", "medium", "low"),
      context: Schema.String,
      correction: Schema.optional(Schema.String),
    }),
  ),
  fixable: Schema.Boolean,
  category: Schema.Literal("syntax", "semantic", "api-usage", "logic", "external"),
})

/**
 * Miner service — extracts and clusters failure signals from sessions.
 *
 * Reference: Pioneer Agent §2.1 — "The diagnosis step mines advantage
 * signals from agent work logs and clusters them into a failure taxonomy."
 */
export class Miner extends Effect.Service<Miner>()("evolve/Miner", {
  effect: Effect.gen(function* () {
    const store = yield* Store

    /**
     * Diagnose sessions by extracting signals and clustering failures.
     *
     * Pipeline:
     * 1. Extract signals from each session's tool calls and messages
     * 2. Cluster signals by failure type
     * 3. Compute cluster statistics and fixability
     */
    const diagnose = (sessions: ReadonlyArray<Session>) =>
      Effect.gen(function* () {
        yield* Effect.log(`[Miner] Diagnosing ${sessions.length} sessions...`)

        // Step 1: Extract all signals
        const signals: Signal[] = []

        for (const session of sessions) {
          for (const tool of session.tools) {
            // Test/compile/lint failures — exit code != 0 is a strong signal
            if (tool.exitCode !== undefined && tool.exitCode !== 0) {
              signals.push({
                sessionId: session.id,
                toolCallId: tool.tool,
                type: tool.tool === "bash" ? "test-fail" : "compile-error",
                severity: "high",
                context: JSON.stringify(tool.input).slice(0, 500),
              })
            }

            // Rejected edits — the user undid the agent's change
            if (!tool.accepted) {
              signals.push({
                sessionId: session.id,
                toolCallId: tool.tool,
                type: "rejected-edit",
                severity: "high",
                context: JSON.stringify(tool.input).slice(0, 500),
              })
            }

            // Retry loops (>2 retries indicates confusion)
            // The agent is stuck trying the same thing repeatedly
            if (tool.retries > 2) {
              signals.push({
                sessionId: session.id,
                toolCallId: tool.tool,
                type: "retry-loop",
                severity: "medium",
                context: JSON.stringify(tool.input).slice(0, 500),
                correction: session.messages.at(-1)?.content?.slice(0, 500),
              })
            }
          }

          // User corrections — user message after assistant action that
          // contains correction keywords indicates the agent was wrong
          const assistantIndices = session.messages
            .map((m, i) => (m.role === "assistant" ? i : -1))
            .filter((i) => i >= 0)

          for (const idx of assistantIndices) {
            const nextMsg = session.messages[idx + 1]
            if (
              nextMsg?.role === "user" &&
              isCorrectionMessage(nextMsg.content)
            ) {
              signals.push({
                sessionId: session.id,
                toolCallId: "user-correction",
                type: "user-correction",
                severity: "high",
                context: session.messages[idx].content.slice(0, 500),
                correction: nextMsg.content.slice(0, 500),
              })
            }
          }
        }

        yield* Effect.log(`[Miner] Extracted ${signals.length} signals`)

        // Step 2: Cluster signals into confusion clusters
        const clusters = clusterSignals(signals)

        yield* Effect.log(`[Miner] Clustered into ${clusters.length} groups:`)
        for (const c of clusters) {
          yield* Effect.log(
            `  ${c.name}: ${c.count} instances, avg retries: ${c.avgRetries.toFixed(1)}, fixable: ${c.fixable}`,
          )
        }

        // Step 3: Build taxonomy
        const taxonomy: Taxonomy = {
          clusters,
          totalSessions: sessions.length,
          totalSignals: signals.length,
          fixableRatio:
            clusters.filter((c) => c.fixable).length /
            Math.max(clusters.length, 1),
        }

        yield* Effect.log(
          `[Miner] Taxonomy: ${clusters.length} clusters, fixable ratio: ${(taxonomy.fixableRatio * 100).toFixed(1)}%`,
        )

        return taxonomy
      })

    return { diagnose } as const
  }),
  dependencies: [Store.Default],
}) {}

/**
 * Check if a user message is a correction.
 * Uses keyword heuristics in multiple languages.
 */
function isCorrectionMessage(content: string): boolean {
  const lower = content.toLowerCase()
  const correctionKeywords = [
    // Chinese corrections
    "不对",
    "应该",
    "错了",
    "不是",
    "修改",
    "改正",
    // English corrections
    "wrong",
    "should be",
    "should not",
    "incorrect",
    "fix",
    "change",
    "not right",
    "error",
    "mistake",
    // Code-specific corrections
    "syntax error",
    "does not compile",
    "fails",
    "broken",
  ]
  return correctionKeywords.some((kw) => lower.includes(kw))
}

/**
 * Cluster signals by failure type using keyword extraction.
 *
 * In production, this would use embeddings (e.g., sentence-transformers)
 * for semantic clustering. The keyword approach is a fast baseline.
 *
 * Reference: Pioneer Agent §2.1 — "Signals are clustered by failure type
 * to form a confusion taxonomy."
 */
function clusterSignals(signals: Signal[]): ConfusionCluster[] {
  const clusters = new Map<string, Signal[]>()

  for (const signal of signals) {
    const key = extractClusterKey(signal)
    const existing = clusters.get(key) || []
    existing.push(signal)
    clusters.set(key, existing)
  }

  return Array.from(clusters.entries())
    .sort((a, b) => b[1].length - a[1].length) // Sort by frequency
    .map(([name, sigs]) => ({
      name,
      count: sigs.length,
      avgRetries:
        sigs.reduce(
          (sum, s) => sum + (s.type === "retry-loop" ? 3 : 1),
          0,
        ) / sigs.length,
      signals: sigs,
      // External/network issues are not fixable via training
      fixable: !name.includes("external") && !name.includes("network"),
      category: categorizeCluster(name),
    }))
}

/**
 * Extract a cluster key from a signal based on its context.
 * Uses keyword matching to categorize failure types.
 */
function extractClusterKey(signal: Signal): string {
  const ctx = signal.context.toLowerCase()

  // Import-related errors
  if (ctx.includes("import") || ctx.includes("require") || ctx.includes("from '"))
    return "missing-import"

  // Type system errors
  if (
    ctx.includes("type") ||
    ctx.includes("typescript") ||
    ctx.includes("type error") ||
    ctx.includes("is not assignable")
  )
    return "type-error"

  // Null/undefined reference
  if (
    ctx.includes("undefined") ||
    ctx.includes("null") ||
    ctx.includes("cannot read")
  )
    return "null-reference"

  // Async/await misuse
  if (
    ctx.includes("async") ||
    ctx.includes("await") ||
    ctx.includes("promise")
  )
    return "async-misuse"

  // API usage errors
  if (
    ctx.includes("api") ||
    ctx.includes("deprecated") ||
    ctx.includes("not a function")
  )
    return "api-usage"

  // Test failures
  if (
    ctx.includes("test") ||
    ctx.includes("assert") ||
    ctx.includes("expect")
  )
    return "test-failure"

  // Linting issues
  if (ctx.includes("lint") || ctx.includes("eslint") || ctx.includes("prettier"))
    return "lint-violation"

  // Styling errors
  if (
    ctx.includes("tailwind") ||
    ctx.includes("css") ||
    ctx.includes("style")
  )
    return "styling-error"

  // React/component errors
  if (ctx.includes("react") || ctx.includes("component") || ctx.includes("hook"))
    return "react-error"

  // Network/external errors
  if (
    ctx.includes("network") ||
    ctx.includes("timeout") ||
    ctx.includes("fetch")
  )
    return "external-network"

  return "general-error"
}

/**
 * Categorize a cluster name into a high-level category.
 */
function categorizeCluster(
  name: string,
): ConfusionCluster["category"] {
  if (
    name.includes("import") ||
    name.includes("type") ||
    name.includes("lint")
  )
    return "syntax"
  if (
    name.includes("null") ||
    name.includes("async") ||
    name.includes("react")
  )
    return "semantic"
  if (name.includes("api")) return "api-usage"
  if (name.includes("test")) return "logic"
  if (name.includes("external") || name.includes("network")) return "external"
  return "semantic"
}

export const MinerLive = Miner.Default
