/**
 * Distiller — Distillation phase of the fast evolution loop.
 *
 * Converts successful trajectories into draft Tactics and failure
 * clusters into negative constraints. Includes dedup to prevent
 * asset bloat.
 *
 * Reference: KEP §44.2 — Distill
 */
import { Effect } from "effect"
import type { Signal, SignalType } from "../evolve/signals"
import type { Tactic, TacticScope, TacticIntent } from "./tactic"
import type { SignalPattern } from "./signals"
import { generateTacticId } from "./tactic"

// ---------------------------------------------------------------------------
// Negative constraint (extracted from failure clusters)
// ---------------------------------------------------------------------------

export interface NegativeConstraint {
  readonly id: string
  readonly description: string
  readonly triggerPatterns: SignalPattern[]
  readonly guardrailAddition: string
}

// ---------------------------------------------------------------------------
// Distillation result
// ---------------------------------------------------------------------------

export interface DistillResult {
  readonly tactics: Tactic[]
  readonly constraints: NegativeConstraint[]
  readonly summary: string
  readonly dedupHitCount: number
  readonly newCount: number
}

// ---------------------------------------------------------------------------
// Helper: content hash for dedup (SHA-256 → first 16 chars)
// ---------------------------------------------------------------------------

function contentHash(scope: TacticScope, title: string, steps: string[]): string {
  const data = scope + "::" + title + "::" + steps.join("\n")
  // Simple hash for now — in production use crypto.createHash
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash).toString(16).slice(0, 16)
}

// ---------------------------------------------------------------------------
// Helper: keyword overlap similarity (0–1)
// ---------------------------------------------------------------------------

function keywordSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) if (wordsB.has(w)) overlap++
  return overlap / Math.max(wordsA.size, wordsB.size)
}

// ---------------------------------------------------------------------------
// Distiller service
// ---------------------------------------------------------------------------

/**
 * Distiller — extracts Tactics from successful sessions and
 * negative constraints from failure clusters.
 *
 * Key behaviors:
 * 1. Success path → compact, single-intent Tactic (draft)
 * 2. Failure cluster → negative constraint
 * 3. Dedup: content hash first, then semantic similarity
 *    - If duplicate found: update stats only, don't create new
 */
export class Distiller extends Effect.Service<Distiller>()("experience/Distiller", {
  effect: Effect.gen(function* () {

    /**
     * Main distill entry point.
     *
     * @param signals      — Signals from a completed session
     * @param opts         — Options: dedup (default true), review (default false)
     * @param existing     — Existing tactic library (for dedup)
     */
    const distill = (
      signals: ReadonlyArray<Signal>,
      opts: { dedup?: boolean } = {},
      existing: ReadonlyArray<Tactic> = [],
    ): Effect.Effect<DistillResult, never, never> =>
      Effect.sync(() => {
        const useDedup = opts.dedup ?? true

        // Separate win signals (pass) and loss signals (fail)
        const winSignals = signals.filter(s => s.verdict === "pass")
        const failSignals = signals.filter(s => s.verdict === "fail")

        const tactics: Tactic[] = []
        const constraints: NegativeConstraint[] = []
        let dedupHitCount = 0

        // --- Distill success paths into Tactics ---
        if (winSignals.length >= 3) {
          // Group by tool/area for more focused tactics
          const byTool = groupByTool(winSignals)

          for (const [toolName, toolSignals] of Object.entries(byTool)) {
            if (toolSignals.length < 2) continue

            // Build a draft tactic from the pattern
            const draft = distillSuccessPattern(toolSignals, toolName)

            if (useDedup) {
              const existingTac = findExisting(draft, existing)
              if (existingTac) {
                // Dedup hit — just update stats in memory
                dedupHitCount++
                continue
              }
            }

            tactics.push(draft)
          }
        }

        // --- Distill failure clusters into negative constraints ---
        if (failSignals.length >= 2) {
          const failClusters = clusterByType(failSignals)
          for (const cluster of failClusters) {
            const constraint = distillFailureCluster(cluster)
            constraints.push(constraint)
          }
        }

        return {
          tactics,
          constraints,
          summary: `${tactics.length} tactics, ${constraints.length} constraints, ${dedupHitCount} dedup hits`,
          dedupHitCount,
          newCount: tactics.length,
        }
      })

    /**
     * Extract a single Tactic from a group of winning signals.
     */
    const distillSuccessPattern = (
      signals: ReadonlyArray<Signal>,
      toolName: string,
    ): Tactic => {
      const dominantType = getDominantType(signals)
      const intent = mapTypeToIntent(dominantType)
      const title = generateTitle(signals, toolName)
      const steps = generateSteps(signals)
      const checks = generateChecks(signals, toolName)

      return {
        id: generateTacticId("global", title),
        scope: "global",
        intent,
        title,
        triggers: [{
          types: [dominantType],
          minConfidence: 0.7,
        }],
        preconditions: ["Applicable to current task context"],
        steps,
        guardrails: {
          maxFiles: 5,
          forbiddenPaths: [".git", "node_modules"],
          smallestReversible: true,
        },
        checks,
        stats: {
          wins: signals.length,
          losses: 0,
          alpha: 1 + signals.length,
          beta: 1,
          lastUsed: new Date().toISOString(),
          uses: signals.length,
        },
        status: "draft",
        provenance: {
          fromSessions: signals.map(s => s.sessionId).filter((v, i, a) => a.indexOf(v) === i),
          createdAt: new Date().toISOString(),
          scrubbed: true,
        },
      }
    }

    /**
     * Extract a negative constraint from a failure cluster.
     */
    const distillFailureCluster = (
      signals: ReadonlyArray<Signal>,
    ): NegativeConstraint => {
      const dominantType = getDominantType(signals)
      return {
        id: `ncon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        description: `Avoid: ${signals[0]?.metadata.userMessage || "common failure pattern"}`,
        triggerPatterns: [{
          types: [dominantType],
          minConfidence: 0.6,
        }],
        guardrailAddition: "Double-check before applying",
      }
    }

    return { distill, distillSuccessPattern, distillFailureCluster } as const
  }),
  dependencies: [],
}) {}

export const DistillerLive = Distiller.Default

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByTool(signals: ReadonlyArray<Signal>): Record<string, Signal[]> {
  const groups: Record<string, Signal[]> = {}
  for (const s of signals) {
    const tool = s.metadata.toolName || "unknown"
    groups[tool] = groups[tool] || []
    groups[tool].push(s)
  }
  return groups
}

function clusterByType(signals: ReadonlyArray<Signal>): Signal[][] {
  const clusters: Record<string, Signal[]> = {}
  for (const s of signals) {
    clusters[s.type] = clusters[s.type] || []
    clusters[s.type].push(s)
  }
  return Object.values(clusters).filter(c => c.length >= 2)
}

function getDominantType(signals: ReadonlyArray<Signal>): SignalType {
  const counts: Record<string, number> = {}
  for (const s of signals) {
    counts[s.type] = (counts[s.type] || 0) + 1
  }
  let maxType: SignalType = "test-pass"
  let maxCount = 0
  for (const [type, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      maxType = type as SignalType
    }
  }
  return maxType
}

function mapTypeToIntent(type: SignalType): TacticIntent {
  switch (type) {
    case "test-pass":
    case "edit-accepted":
      return "optimize"
    case "test-fail":
    case "compile-error":
    case "lint-error":
      return "fix"
    case "user-correction":
    case "retry-loop":
      return "convention"
    case "edit-rejected":
      return "workflow"
    case "post-hoc-edit":
      return "convention"
    default:
      return "convention"
  }
}

function generateTitle(signals: ReadonlyArray<Signal>, toolName: string): string {
  const type = getDominantType(signals)
  const descriptions: Record<string, string> = {
    "test-pass": `Ensure tests pass after ${toolName} changes`,
    "test-fail": `Debug test failures in ${toolName} workflow`,
    "compile-error": `Fix compilation errors before proceeding`,
    "lint-error": `Address lint errors in changed files`,
    "edit-accepted": `Apply accepted edits with verification`,
    "user-correction": `Follow user corrections for accuracy`,
    "retry-loop": `Break retry loops with explicit checks`,
    "post-hoc-edit": `Handle post-hoc edit requirements`,
    "edit-rejected": `Recover from rejected edits gracefully`,
  }
  return descriptions[type] || `Strategy for ${toolName} operations`
}

function generateSteps(signals: ReadonlyArray<Signal>): string[] {
  const type = getDominantType(signals)
  const stepSets: Record<string, string[]> = {
    "test-pass": [
      "Run tests before committing changes",
      "Verify all modified files are covered",
      "Confirm test exit code is 0",
    ],
    "test-fail": [
      "Run failing test with verbose output",
      "Check related source files for regressions",
      "Fix root cause, not just symptoms",
      "Re-run tests to confirm resolution",
    ],
    "compile-error": [
      "Check TypeScript compilation: npx tsc --noEmit",
      "Review import paths and type definitions",
      "Fix type errors before runtime testing",
    ],
    "lint-error": [
      "Run linter on changed files",
      "Auto-fix where possible: npx eslint --fix",
      "Manually fix remaining violations",
    ],
    "edit-accepted": [
      "Apply the edit as proposed",
      "Verify the change with tests",
      "Confirm no regressions in related files",
    ],
    "user-correction": [
      "Understand the user's correction intent",
      "Apply the corrected approach",
      "Verify the fix matches user expectations",
    ],
    "retry-loop": [
      "Add explicit pre-conditions before action",
      "Implement incremental progress checks",
      "Set maximum retry limit with fallback",
    ],
  }
  return stepSets[type] || [
    "Analyze the task context",
    "Apply the appropriate fix",
    "Verify with objective checks",
  ]
}

function generateChecks(signals: ReadonlyArray<Signal>, toolName: string): string[] {
  return [
    `npm test`,
    `npx tsc --noEmit`,
    `git diff --stat`,
  ]
}

function findExisting(
  draft: { scope: string; title: string; steps: string[] },
  existing: ReadonlyArray<Tactic>,
): Tactic | undefined {
  const draftHash = contentHash(draft.scope as TacticScope, draft.title, draft.steps)

  for (const tac of existing) {
    // Exact hash match
    const tacHash = contentHash(tac.scope, tac.title, tac.steps)
    if (tacHash === draftHash) return tac

    // Semantic similarity > 0.8
    const sim = keywordSimilarity(
      draft.title + " " + draft.steps.join(" "),
      tac.title + " " + tac.steps.join(" "),
    )
    if (sim >= 0.8) return tac
  }

  return undefined
}
