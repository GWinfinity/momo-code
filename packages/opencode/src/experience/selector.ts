/**
 * selector.ts — Selection layer for the experience fast loop
 *
 * Responsible for choosing which tactics to inject into a prompt
 * for a given task. The Selector implements two explore/exploit
 * strategies:
 *
 * - **Thompson sampling** (default) — Sample from a Beta posterior
 *   for each tactic, then rank by the sample. Naturally balances
 *   exploration (uncertain tactics get lucky draws) with exploitation
 *   (high-performing tactics usually win).
 *
 * - **UCB** (alternative) — Upper Confidence Bound ranking for
 *   scenarios where you want deterministic, worst-case-optimal
 *   selection.
 *
 * The Selector also computes scope priority so that narrowly scoped
 * tactics (repo-specific, language-specific) are preferred over
 * broadly scoped ones (global) when relevance is equal.
 */

import { Effect } from "effect"
import type { Tactic, TacticScope, TacticStats, TacticStatus } from "./tactic"
import {
  winRate,
  thompsonSample,
  ucbScore,
  canActivate,
  canPromote,
  shouldRetire,
  generateTacticId,
} from "./tactic"
import type { Case } from "./case"
import { createCase } from "./case"
import type { Signal, SignalType, SignalPattern, SignalMetadata } from "./signals"
import { matchSignalPattern } from "./signals"
import { ExperienceStore } from "./store"
import type { LedgerEntry } from "./ledger"

// ---------------------------------------------------------------------------
// Selection options
// ---------------------------------------------------------------------------

/**
 * Configuration for tactic selection.
 */
export interface SelectionOpts {
  /** Maximum number of tactics to select (default: 6) */
  readonly k: number

  /** Ranking method: Thompson sampling or UCB */
  readonly method: "thompson" | "ucb"

  /** Maximum tokens available for the injected tactic block */
  readonly budgetTokens: number

  /** Minimum win-rate threshold for a tactic to be considered (0-1) */
  readonly minWinRate?: number

  /** Apply scope-priority boost (default: true) */
  readonly scopeBoost?: boolean
}

/** Default selection options. */
export const defaultSelectionOpts: SelectionOpts = {
  k: 6,
  method: "thompson",
  budgetTokens: 2048,
  minWinRate: 0.1,
  scopeBoost: true,
}

// ---------------------------------------------------------------------------
// Task context for selection
// ---------------------------------------------------------------------------

/**
 * Describes the current task so the Selector can match tactics
 * against it.
 */
export interface TaskContext {
  /** Signals detected in the current task/session */
  readonly signals: ReadonlyArray<Signal>

  /** The repository name (for repo-scoped tactic matching) */
  readonly repo?: string

  /** The programming language (for language-scoped matching) */
  readonly language?: string

  /** The user identifier (for user-scoped matching) */
  readonly userId?: string

  /** The primary tools expected to be used */
  readonly expectedTools?: string[]
}

// ---------------------------------------------------------------------------
// Ranked candidate
// ---------------------------------------------------------------------------

/**
 * A tactic that has been scored and ranked by the selection algorithm.
 */
export interface RankedTactic {
  /** The tactic itself */
  readonly tactic: Tactic

  /** The raw score from the ranking method (Thompson sample or UCB) */
  readonly rawScore: number

  /** Scope-priority multiplier applied */
  readonly scopeBoost: number

  /** Final composite score (rawScore * scopeBoost) */
  readonly finalScore: number

  /** Whether this tactic matched any task signals */
  readonly signalMatched: boolean
}

// ---------------------------------------------------------------------------
// Beta distribution sampling (for Thompson)
// ---------------------------------------------------------------------------

/**
 * Sample from a Beta(α, β) distribution using the Marsaglia method.
 *
 * @param alpha — Success count + 1
 * @param beta — Failure count + 1
 * @returns A random sample in (0, 1)
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use the relationship: Beta(α,β) ~ Gamma(α,1) / (Gamma(α,1) + Gamma(β,1))
  const x = sampleGamma(alpha, 1)
  const y = sampleGamma(beta, 1)
  return x / (x + y + 1e-10) // small epsilon to prevent division by zero
}

/**
 * Sample from a Gamma(k, θ) distribution using the Marsaglia-Tsang
 * method for k >= 1, and a fallback for k < 1.
 */
function sampleGamma(shape: number, scale: number): number {
  if (shape < 1) {
    // Use the property: Gamma(a,1) ~ Gamma(a+1,1) * U^(1/a)
    return sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape)
  }

  // Marsaglia-Tsang method
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)

  while (true) {
    let x: number, v: number
    do {
      x = sampleNormal()
      v = 1 + c * x
    } while (v <= 0)

    v = v * v * v
    const u = Math.random()

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v * scale
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale
    }
  }
}

/**
 * Sample from the standard normal distribution using the Box-Muller method.
 */
function sampleNormal(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// ---------------------------------------------------------------------------
// Selector service
// ---------------------------------------------------------------------------

/**
 * The Selector chooses which tactics to inject for a given task.
 * It implements explore/exploit trade-offs via Thompson sampling
 * or UCB, and respects scope specificity and token budgets.
 *
 * @remarks
 * The Selector is the "decision" phase of the fast loop. After
 * the Collector has observed and the Distiller has learned, the
 * Selector decides which knowledge to apply.
 */
export class Selector extends Effect.Service<Selector>()(
  "experience/Selector",
  {
    effect: Effect.gen(function* () {
      const store = yield* ExperienceStore

      /**
       * Retrieve candidate tactics that match the signals in the
       * current task context.
       *
       * A tactic is considered a candidate if:
       * 1. Its status is "active" or "promoted" (not "draft" or "retired")
       * 2. At least one of its trigger patterns matches a task signal
       * 3. Its scope is compatible with the task context
       * 4. Its win-rate is above the minimum threshold
       *
       * @param ctx — The task context with signals and metadata
       * @param opts — Selection options
       * @returns Effect resolving to matching candidate tactics
       */
      const retrieve = (
        ctx: TaskContext,
        opts?: Partial<SelectionOpts>,
      ): Effect.Effect<Tactic[]> =>
        Effect.gen(function* () {
          const mergedOpts = { ...defaultSelectionOpts, ...opts }

          yield* Effect.log(
            `[Selector] Retrieving candidates for task with ${ctx.signals.length} signals`,
          )

          // Fetch all active tactics from the store
          const allTactics = yield* store.loadTactics().pipe(
            Effect.orElse(() => Effect.succeed([] as Tactic[])),
          )

          yield* Effect.log(
            `[Selector] Store returned ${allTactics.length} active tactics`,
          )

          const candidates: Tactic[] = []

          for (const tactic of allTactics) {
            // Filter by minimum win rate
            const wr = winRate(tactic.stats)
            if (wr < (mergedOpts.minWinRate ?? 0)) {
              continue
            }

            // Check scope compatibility
            if (!isScopeCompatible(tactic.scope, ctx)) {
              continue
            }

            // Check trigger pattern match against task signals
            const signalMatched = tactic.triggers.some((pattern: SignalPattern) =>
              ctx.signals.some((signal) => matchSignalPattern(signal, pattern)),
            )

            if (signalMatched) {
              candidates.push(tactic)
            }
          }

          yield* Effect.log(
            `[Selector] Found ${candidates.length} candidate tactics`,
          )

          return candidates
        })

      /**
       * Rank candidates using Thompson sampling.
       *
       * For each tactic, sample from Beta(α=wins+1, β=losses+1) where wins/losses
       * are from the tactic's Beta distribution stats. Tactics with
       * more observations have tighter posteriors and less variance;
       * tactics with few observations can get lucky samples, encouraging
       * exploration.
       *
       * @param candidates — Tactics to rank
       * @param ctx — Task context for scope-priority computation
       * @param opts — Selection options
       * @returns Effect resolving to ranked tactics sorted by finalScore desc
       */
      const rankThompson = (
        candidates: ReadonlyArray<Tactic>,
        ctx: TaskContext,
        opts?: Partial<SelectionOpts>,
      ): Effect.Effect<RankedTactic[]> =>
        Effect.sync(() => {
          const mergedOpts = { ...defaultSelectionOpts, ...opts }

          const ranked: RankedTactic[] = candidates.map((tactic) => {
            const w = tactic.stats.wins
            const l = tactic.stats.losses

            // Sample from Beta(wins+1, losses+1)
            const rawScore = sampleBeta(w + 1, l + 1)

            // Scope boost
            const scopeBoost = mergedOpts.scopeBoost
              ? computeScopePriority(tactic.scope, ctx)
              : 1.0

            // Check if any task signal matches this tactic's triggers
            const signalMatched = tactic.triggers.some((pattern: SignalPattern) =>
              ctx.signals.some((signal) =>
                matchSignalPattern(signal, pattern),
              ),
            )

            return {
              tactic,
              rawScore,
              scopeBoost,
              finalScore: rawScore * scopeBoost,
              signalMatched,
            }
          })

          // Sort by final score descending
          ranked.sort((a: RankedTactic, b: RankedTactic) => b.finalScore - a.finalScore)

          return ranked
        })

      /**
       * Rank candidates using the Upper Confidence Bound (UCB1) algorithm.
       *
       * UCB = winRate + sqrt(2 * ln(totalUses) / tacticUses)
       *
       * This provides deterministic worst-case-optimal selection.
       * Tactics with fewer attempts get a larger exploration bonus.
       *
       * @param candidates — Tactics to rank
       * @param ctx — Task context for scope-priority computation
       * @param opts — Selection options
       * @returns Effect resolving to ranked tactics sorted by finalScore desc
       */
      const rankUcb = (
        candidates: ReadonlyArray<Tactic>,
        ctx: TaskContext,
        opts?: Partial<SelectionOpts>,
      ): Effect.Effect<RankedTactic[]> =>
        Effect.sync(() => {
          const mergedOpts = { ...defaultSelectionOpts, ...opts }

          // Total uses across all candidates for the exploration term
          const totalUses = candidates.reduce(
            (sum, t) => sum + t.stats.uses,
            0,
          )

          const logTotal = Math.log(Math.max(totalUses, 1))

          const ranked: RankedTactic[] = candidates.map((tactic) => {
            const w = tactic.stats.wins
            const l = tactic.stats.losses
            const n = tactic.stats.uses

            // Exploitation term: empirical win rate
            const exploitation = n === 0 ? 0.5 : w / n

            // Exploration term: confidence bound width
            const exploration =
              n === 0 ? Infinity : Math.sqrt((2 * logTotal) / n)

            const rawScore = exploitation + exploration

            const scopeBoost = mergedOpts.scopeBoost
              ? computeScopePriority(tactic.scope, ctx)
              : 1.0

            const signalMatched = tactic.triggers.some((pattern: SignalPattern) =>
              ctx.signals.some((signal) =>
                matchSignalPattern(signal, pattern),
              ),
            )

            return {
              tactic,
              rawScore,
              scopeBoost,
              finalScore: rawScore * scopeBoost,
              signalMatched,
            }
          })

          // Sort by final score descending
          ranked.sort((a: RankedTactic, b: RankedTactic) => b.finalScore - a.finalScore)

          return ranked
        })

      /**
       * Compute the scope-priority score for a tactic given a task
       * context.
       *
       * Priority ordering (highest to lowest):
       * 1. **Repo-specific** — exact repo match
       * 2. **Language-specific** — language match
       * 3. **User-specific** — user match
       * 4. **Global** — always applicable, lowest specificity
       *
       * @param scope — The tactic's scope
       * @param ctx — The task context
       * @returns Priority multiplier in [1.0, 2.0]
       */
      const scopePriority = (
        scope: TacticScope,
        ctx: TaskContext,
      ): number => {
        return computeScopePriority(scope, ctx)
      }

      /**
       * Full selection pipeline: retrieve → rank → filter by budget.
       *
       * This is the main entry-point for consumers. It retrieves
       * candidates matching the task signals, ranks them by the
       * chosen method, and applies the token budget.
       *
       * @param ctx — Task context
       * @param opts — Selection options
       * @returns Effect resolving to the top-k tactics within budget
       */
      const select = (
        ctx: TaskContext,
        opts?: Partial<SelectionOpts>,
      ): Effect.Effect<RankedTactic[]> =>
        Effect.gen(function* () {
          const mergedOpts = { ...defaultSelectionOpts, ...opts }

          yield* Effect.log(
            `[Selector] Selecting tactics (method=${mergedOpts.method}, k=${mergedOpts.k}, budget=${mergedOpts.budgetTokens}t)`,
          )

          // Step 1: Retrieve candidates
          const candidates = yield* retrieve(ctx, mergedOpts)

          if (candidates.length === 0) {
            yield* Effect.log(`[Selector] No candidates found`)
            return []
          }

          // Step 2: Rank
          const ranked =
            mergedOpts.method === "thompson"
              ? yield* rankThompson(candidates, ctx, mergedOpts)
              : yield* rankUcb(candidates, ctx, mergedOpts)

          // Step 3: Apply token budget
          const selected = applyTokenBudget(
            ranked,
            mergedOpts.budgetTokens,
            mergedOpts.k,
          )

          yield* Effect.log(
            `[Selector] Selected ${selected.length} tactics (top score=${selected[0]?.finalScore.toFixed(3) ?? "N/A"})`,
          )

          return selected
        })

      return {
        retrieve,
        rankThompson,
        rankUcb,
        scopePriority,
        select,
      } as const
    }),
  },
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a tactic's scope is compatible with the given task
 * context.
 *
 * TacticScope is a string union: "global" | "repo" | "user" | `lang:${string}`
 * We match against the ctx fields for compatibility.
 */
function isScopeCompatible(scope: TacticScope, ctx: TaskContext): boolean {
  if (scope === "global") {
    return true
  }
  if (scope === "repo") {
    return ctx.repo !== undefined
  }
  if (scope === "user") {
    return ctx.userId !== undefined
  }
  if (scope.startsWith("lang:")) {
    const lang = scope.slice(5)
    return ctx.language === lang
  }
  // Unknown scope — be permissive
  return true
}

/**
 * Compute a scope-priority multiplier.
 *
 * Higher values mean the tactic is more specifically targeted to
 * the current task context, so it should be preferred.
 *
 * Returns a value in [1.0, 2.0]:
 * - Global:     1.0
 * - User:       1.2
 * - Language:   1.5
 * - Repo match: 2.0
 */
function computeScopePriority(
  scope: TacticScope,
  ctx: TaskContext,
): number {
  if (scope === "global") {
    return 1.0
  }
  if (scope === "user") {
    return ctx.userId ? 1.2 : 1.0
  }
  if (scope.startsWith("lang:")) {
    const lang = scope.slice(5)
    return ctx.language === lang ? 1.5 : 1.0
  }
  if (scope === "repo") {
    return ctx.repo ? 2.0 : 1.0
  }
  return 1.0
}

/**
 * Apply the token budget to a ranked list of tactics.
 *
 * Walks the ranked list in order, including tactics until the
 * token budget would be exhausted. Respects the max count (k).
 * Uses a rough heuristic: ~100 tokens per tactic (formatted).
 */
function applyTokenBudget(
  ranked: RankedTactic[],
  budgetTokens: number,
  maxCount: number,
): RankedTactic[] {
  const selected: RankedTactic[] = []
  let remainingTokens = budgetTokens

  for (const rt of ranked) {
    if (selected.length >= maxCount) break

    // Rough estimate: ~100 tokens per tactic (title + steps + checks)
    const tacticTokens = 100

    if (tacticTokens <= remainingTokens) {
      selected.push(rt)
      remainingTokens -= tacticTokens
    }

    // If we can't fit anything else, stop
    if (remainingTokens < 50) break
  }

  return selected
}

export const SelectorLive = Selector.Default
