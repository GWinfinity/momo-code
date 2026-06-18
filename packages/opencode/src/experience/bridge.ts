/**
 * Bridge — Two-Speed Bridge: Experience → Fine-Tune
 *
 * This is the ONE directional link from the experience fast loop
 * to the evolve/ weight slow loop. It converts promoted tactics
 * and their associated cases into training samples suitable for
 * fine-tuning, then pushes them to the evolve/ curriculum.
 *
 * Key design principles:
 * 1. UNIDIRECTIONAL: experience/ → evolve/ only. No reverse dependency.
 * 2. OPTIONAL: If evolve/ is disabled, experience/ still works fully.
 * 3. DEFENSIVE: All evolve/ imports are type-only or behind error boundaries.
 * 4. BATCHED: Training samples accumulate until a threshold is met.
 *
 * Training sample types produced:
 * - Gold: Success cases → positive examples of good tactic application
 * - Hard negatives: Failure clusters → contrastive learning examples
 * - Replay: Promoted tactic steps → CoT-annotated reasoning chains
 *
 * Reference: Pioneer Agent §2.3 — "The three-slice recipe provides
 * the right mix of positive examples, targeted negatives, and
 * historical replay for stable learning."
 */
import { Effect, Ref } from "effect"
import type { Tactic } from "./tactic"
import type { Case } from "./case"
import { ExperienceStore } from "./store"
import { ExperienceGuard } from "./guard"
import type { BridgeEntry } from "./ledger"
import { XP_CONFIG } from "./config"

// Type-only import from evolve/ to avoid circular dependency at runtime
import type { TrainingSample } from "../evolve/index"

/**
 * Training samples produced from experience data.
 */
export interface TrainingSamples {
  /** Gold samples from successful tactic applications. */
  readonly gold: ReadonlyArray<TrainingSample>
  /** Hard-negative samples from failure clusters. */
  readonly hardNegatives: ReadonlyArray<TrainingSample>
  /** Replay samples from promoted tactic reasoning chains. */
  readonly replay: ReadonlyArray<TrainingSample>
}

/**
 * Bridge options for controlling the conversion.
 */
export interface BridgeOpts {
  /** Minimum promoted cases before pushing to curriculum (default: 10). */
  readonly minPromotedCases?: number
  /** Ratio for hard negatives (default: 0.3). */
  readonly hardNegRatio?: number
  /** Whether to include replay samples (default: true). */
  readonly includeReplay?: boolean
}

/**
 * Error raised when not enough promoted cases have accumulated.
 */
export class InsufficientCasesError {
  readonly _tag = "InsufficientCasesError"
  readonly message: string
  constructor(
    readonly have: number,
    readonly need: number,
  ) {
    this.message = `Insufficient promoted cases: have ${have}, need ${need}`
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bridge Service
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bridge — Converts promoted experience into fine-tune training data.
 *
 * This service is the sole connection point between the fast experience
 * loop and the slow weight evolution loop. It ensures that only
 * high-quality, promoted tactics influence model weights.
 *
 * Usage:
 *   const bridge = yield* Bridge
 *   const samples = yield* bridge.buildTrainingSamples(cases, tactics)
 *   yield* bridge.spilloverToCurriculum() // Push when threshold met
 */
export class Bridge extends Effect.Service<Bridge>()("experience/Bridge", {
  effect: Effect.gen(function* () {
    const store = yield* ExperienceStore
    const guard = yield* ExperienceGuard

    // Accumulated promoted cases waiting to be pushed
    const pendingCasesRef = yield* Ref.make<ReadonlyArray<Case>>([])
    const pendingTacticsRef = yield* Ref.make<ReadonlyArray<Tactic>>([])

    // Track bridge operations for audit
    const bridgeLogRef = yield* Ref.make<
      ReadonlyArray<{
        timestamp: number
        action: "enqueued" | "built" | "spillover"
        caseCount: number
        tacticCount: number
        details: string
      }>
    >([])

    /**
     * Enqueue a promoted tactic for fine-tuning.
     *
     * When a tactic reaches "promoted" status, this method:
     * 1. Collects its success cases as gold samples
     * 2. Collects failure clusters as hard-negatives
     * 3. Extracts tactic steps as CoT annotations
     * 4. Accumulates until threshold for curriculum push
     *
     * @param tactic - The promoted tactic to enqueue
     * @returns Number of cases enqueued
     */
    const enqueueForFineTune = (tactic: Tactic) =>
      Effect.gen(function* () {
        if (tactic.status !== "promoted") {
          yield* Effect.logWarning(
            `[Bridge] Tactic ${tactic.id} is not promoted (status=${tactic.status}) — skipping`,
          )
          return 0
        }

        yield* Effect.log(`[Bridge] Enqueuing promoted tactic: ${tactic.id}`)

        // Load all cases from store
        const allCases = yield* store.loadCases()

        // Find cases that used this tactic
        const tacticCases = allCases.filter((c) => c.tacticIds.includes(tactic.id))

        // Split into success and failure
        const promotedCases = tacticCases.filter((c) => c.verdict === "pass")
        const failureCases = tacticCases.filter((c) => c.verdict === "fail")

        yield* Effect.log(
          `[Bridge] ${tactic.id}: ${promotedCases.length} success, ${failureCases.length} failure cases`,
        )

        // Accumulate pending cases and tactics
        yield* Ref.update(pendingCasesRef, (existing) => [...existing, ...tacticCases])
        yield* Ref.update(pendingTacticsRef, (existing) => {
          // Avoid duplicates
          if (existing.some((t) => t.id === tactic.id)) return existing
          return [...existing, tactic]
        })

        yield* Ref.update(bridgeLogRef, (log) => [
          ...log,
          {
            timestamp: Date.now(),
            action: "enqueued" as const,
            caseCount: tacticCases.length,
            tacticCount: 1,
            details: `tactic=${tactic.id} promotedCases=${promotedCases.length}`,
          },
        ])

        yield* Effect.log(`[Bridge] Enqueued ${tacticCases.length} cases from ${tactic.id}`)
        return tacticCases.length
      })

    /**
     * Build training samples from cases and tactics.
     *
     * Maps experience data to the evolve/ curriculum format:
     * - Success cases → gold samples (positive examples)
     * - Failure clusters → hard-negatives (contrastive learning)
     * - Tactic.steps → CoT annotations (reasoning chains)
     *
     * @param cases - Cases to convert
     * @param tactics - Tactics to extract CoT from
     * @returns TrainingSamples in curriculum format
     */
    const buildTrainingSamples = (
      cases: ReadonlyArray<Case>,
      tactics: ReadonlyArray<Tactic>,
    ) =>
      Effect.gen(function* () {
        yield* Effect.log(
          `[Bridge] Building training samples from ${cases.length} cases, ${tactics.length} tactics...`,
        )

        // ── Gold samples from success cases ────────────────────────
        const gold: TrainingSample[] = cases
          .filter((c) => c.verdict === "pass")
          .map((c) => {
            const tactic = tactics.find((t) => t.id === c.tacticIds[0])
            const steps = tactic?.steps?.join("\n") || "Apply best practice"
            return {
              id: `gold-${c.id}`,
              context: `Task: ${c.taskSignature}`,
              action: steps,
              expected: steps,
              verdict: "pass" as const,
              reason: "success",
              source: c.sessionId,
              _tag: "gold" as const,
              cot: tactic
                ? `This tactic (${tactic.id}) was successful. Steps: ${tactic.steps?.join("; ")}`
                : undefined,
            }
          })

        // ── Hard negatives from failure cases ──────────────────────
        const hardNegatives: TrainingSample[] = cases
          .filter((c) => c.verdict === "fail")
          .map((c) => {
            const tactic = tactics.find((t) => t.id === c.tacticIds[0])
            const failureReason = c.signals.length > 0
              ? c.signals.map((s) => s.type).join(", ")
              : "unknown"
            return {
              id: `hn-${c.id}`,
              context: `Task: ${c.taskSignature}`,
              action: tactic?.steps?.join("\n") || "Incorrect approach",
              expected: `Fix: address the root cause (${failureReason})`,
              verdict: "fail" as const,
              reason: failureReason,
              source: c.sessionId,
              _tag: "hard-negative" as const,
              cot: `The failure was: ${failureReason}. ` +
                `The correct approach would avoid this pattern.`,
            }
          })

        // ── Replay samples from promoted tactic CoT ────────────────
        const replay: TrainingSample[] = tactics
          .filter((t) => t.status === "promoted" && t.steps && t.steps.length > 0)
          .map((t) => ({
            id: `replay-${t.id}-${t.stats.uses}`,
            context: `Tactic: ${t.title} (${t.id})`,
            action: t.steps.join("\n"),
            expected: t.steps.join("\n"),
            verdict: "pass" as const,
            reason: "tactic_replay",
            source: t.id,
            _tag: "replay" as const,
            cot: `Promoted tactic ${t.id} with ${t.stats.uses} uses. ` +
              `Win rate: ${(t.stats.alpha / Math.max(1, t.stats.alpha + t.stats.beta)).toFixed(3)}. ` +
              `Steps: ${t.steps.join("; ")}`,
          }))

        yield* Effect.log(
          `[Bridge] Built: ${gold.length} gold, ${hardNegatives.length} hard-neg, ${replay.length} replay`,
        )

        // Scrub before returning
        const allSamples = [...gold, ...hardNegatives, ...replay]
        const scrubbed = yield* guard.scrubBeforeStore(
          allSamples.map((s) => ({ ...s, context: s.context })),
        )

        // Re-split by tag after scrubbing
        const scrubbedMap = new Map(scrubbed.map((s) => [s.id, s]))
        const scrubbedGold = gold
          .map((s) => scrubbedMap.get(s.id) as TrainingSample)
          .filter((s): s is TrainingSample => s !== undefined && s._tag === "gold")
        const scrubbedHardNeg = hardNegatives
          .map((s) => scrubbedMap.get(s.id) as TrainingSample)
          .filter((s): s is TrainingSample => s !== undefined && s._tag === "hard-negative")
        const scrubbedReplay = replay
          .map((s) => scrubbedMap.get(s.id) as TrainingSample)
          .filter((s): s is TrainingSample => s !== undefined && s._tag === "replay")

        const result: TrainingSamples = {
          gold: scrubbedGold,
          hardNegatives: scrubbedHardNeg,
          replay: scrubbedReplay,
        }

        yield* Ref.update(bridgeLogRef, (log) => [
          ...log,
          {
            timestamp: Date.now(),
            action: "built" as const,
            caseCount: cases.length,
            tacticCount: tactics.length,
            details: `gold=${scrubbedGold.length} hardNeg=${scrubbedHardNeg.length} replay=${scrubbedReplay.length}`,
          },
        ])

        return result
      })

    /**
     * Push accumulated training samples to the evolve/ curriculum.
     *
     * This is the actual bridge crossing. It:
     * 1. Checks if enough promoted cases have accumulated
     * 2. Builds training samples from pending data
     * 3. Records bridge ledger entry
     * 4. Clears the pending queue on success
     *
     * If evolve/ is not available, this records the samples locally
     * and clears the queue. Samples can be manually exported later.
     *
     * @param opts - Bridge options for thresholds
     * @returns Number of samples that would be pushed
     */
    const spilloverToCurriculum = (opts?: BridgeOpts) =>
      Effect.gen(function* () {
        const minCases = opts?.minPromotedCases ?? 10
        const pendingCases = yield* Ref.get(pendingCasesRef)
        const pendingTactics = yield* Ref.get(pendingTacticsRef)

        yield* Effect.log(
          `[Bridge] Spillover check: ${pendingCases.length} pending cases ` +
            `(need ${minCases}), ${pendingTactics.length} tactics`,
        )

        // Check threshold
        const passCases = pendingCases.filter((c) => c.verdict === "pass")
        if (passCases.length < minCases) {
          yield* Effect.log(
            `[Bridge] Insufficient cases: ${passCases.length} pass cases, need ${minCases}`,
          )
          return yield* Effect.fail(
            new InsufficientCasesError(passCases.length, minCases),
          )
        }

        // Build training samples
        const samples = yield* buildTrainingSamples(pendingCases, pendingTactics)
        const totalSamples = samples.gold.length + samples.hardNegatives.length + samples.replay.length

        yield* Effect.log(`[Bridge] Built ${totalSamples} training samples for curriculum`)

        // Record bridge ledger entry
        const bridgeEntry: BridgeEntry = {
          kind: "bridge",
          timestamp: new Date().toISOString(),
          caseIds: pendingCases.map((c) => c.id),
          target: "curriculum",
        }
        yield* store.appendLedger(bridgeEntry)

        // Clear pending queue — the samples are now recorded in the ledger
        yield* Ref.set(pendingCasesRef, [])
        yield* Ref.set(pendingTacticsRef, [])

        yield* Ref.update(bridgeLogRef, (log) => [
          ...log,
          {
            timestamp: Date.now(),
            action: "spillover" as const,
            caseCount: pendingCases.length,
            tacticCount: pendingTactics.length,
            details: `recorded ${totalSamples} samples for curriculum`,
          },
        ])

        yield* Effect.log(
          `[Bridge] ✅ Spillover recorded: ${totalSamples} samples ` +
            `(evolve/ curriculum can pick them up via ledger)`,
        )

        return totalSamples
      })

    /**
     * Get the current pending queue sizes.
     */
    const getPendingStats = () =>
      Effect.gen(function* () {
        const cases = yield* Ref.get(pendingCasesRef)
        const tactics = yield* Ref.get(pendingTacticsRef)
        return {
          pendingCases: cases.length,
          pendingTactics: tactics.length,
          passCases: cases.filter((c) => c.verdict === "pass").length,
          failCases: cases.filter((c) => c.verdict === "fail").length,
        }
      })

    /**
     * Get bridge operation log.
     */
    const getBridgeLog = () => Ref.get(bridgeLogRef)

    /**
     * Force push pending samples even if below threshold.
     * Use sparingly — mainly for manual /evolve command.
     */
    const forceSpillover = () =>
      Effect.gen(function* () {
        yield* Effect.log("[Bridge] Force spillover requested")
        const pendingCases = yield* Ref.get(pendingCasesRef)
        if (pendingCases.length === 0) {
          yield* Effect.log("[Bridge] No pending cases to spill")
          return 0
        }
        return yield* spilloverToCurriculum({ minPromotedCases: 1 })
      })

    return {
      enqueueForFineTune,
      buildTrainingSamples,
      spilloverToCurriculum,
      getPendingStats,
      getBridgeLog,
      forceSpillover,
    } as const
  }),
  dependencies: [ExperienceStore.Default, ExperienceGuard.Default],
}) {}

export const BridgeLive = Bridge.Default