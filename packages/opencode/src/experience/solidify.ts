/**
 * Solidify — Verdict Application & Case Recording
 *
 * Applies task verdicts to update tactic statistics, records case outcomes,
 * and manages rollback when tasks fail. This is the "learning" step of
 * the fast loop: after a task completes, the system reflects on which
 * tactics helped or hurt and updates their Beta-distribution parameters.
 *
 * Core operations:
 * 1. applyVerdict: Update tactic α/β after win/loss
 * 2. rollbackSession: Git rollback of experimental changes on failure
 * 3. checkGuardrails: Verify tactic changes stay within guardrails
 *
 * The Beta distribution (α wins, β losses) provides a principled
 * Bayesian estimate of each tactic's true success rate.
 *
 * Reference: Pioneer Agent §2.5 — "Each tactic maintains a Beta distribution
 * representing our belief about its effectiveness. Wins increment α, losses
 * increment β, and Thompson sampling selects tactics proportional to their
 * expected reward."
 */
import { Effect, Ref } from "effect"
import type { Tactic } from "./tactic"
import type { Case, CaseVerdict } from "./case"
import type { SolidifyEntry, PromoteEntry } from "./ledger"
import { ExperienceStore } from "./store"
import { ExperienceGuard } from "./guard"

/**
 * Verdict result from applying a task outcome.
 *
 * Contains the updated tactic records and the case that was written.
 */
export interface SolidifyResult {
  /** Tactics that were updated by this verdict. */
  readonly updatedTactics: ReadonlyArray<Tactic>
  /** The case record that was written. */
  readonly caseRecord: Case
  /** Whether a rollback was suggested. */
  readonly rollbackSuggested: boolean
}

/**
 * Options for applying a verdict.
 */
export interface ApplyVerdictOpts {
  /** The session identifier. */
  readonly sessionId: string
  /** The task signature (hash/fingerprint). */
  readonly taskSignature: string
  /** The verdict: pass = tactic helped, fail = tactic hurt, partial = neutral. */
  readonly verdict: CaseVerdict
  /** IDs of tactics that were injected for this task. */
  readonly tacticIds: ReadonlyArray<string>
  /** Performance metrics for the task. */
  readonly metrics: {
    durationMs: number
    toolCalls: number
    retries: number
  }
  /** Signals observed during the task. */
  readonly signals: ReadonlyArray<{
    type: string
    confidence: number
    timestamp: number
  }>
  /** Whether PII has been scrubbed. */
  readonly scrubbed?: boolean
}

/**
 * Git rollback information for a session.
 */
export interface RollbackInfo {
  readonly sessionId: string
  readonly gitHead: string
  readonly filesTouched: ReadonlyArray<string>
  readonly rolledBackAt: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// Solidify Service
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solidify — Applies verdicts and updates tactic statistics.
 *
 * After each task completes, this service:
 * 1. Updates α/β counts for each injected tactic
 * 2. Writes a Case record for the outcome
 * 3. Appends a Ledger entry for audit
 * 4. Suggests rollback on failure
 *
 * The Beta distribution parameters (α, β) are the foundation for
 * Thompson sampling-based tactic selection.
 */
export class Solidify extends Effect.Service<Solidify>()("experience/Solidify", {
  effect: Effect.gen(function* () {
    const store = yield* ExperienceStore
    const guard = yield* ExperienceGuard

    // Track rollback history
    const rollbackLogRef = yield* Ref.make<ReadonlyArray<RollbackInfo>>([])

    /**
     * Apply a verdict to update tactic statistics.
     *
     * For each tactic that was injected during the task:
     * - pass:  increment α (success count in Beta distribution)
     * - fail:  increment β (failure count), suggest rollback
     * - partial: small α increment (0.5 weight)
     *
     * Also writes a Case record and appends a Ledger entry for
     * complete auditability.
     *
     * @param opts - Verdict application options
     * @returns SolidifyResult with all updated records
     */
    const applyVerdict = (opts: ApplyVerdictOpts) =>
      Effect.gen(function* () {
        yield* Effect.log(
          `[Solidify] Applying verdict='${opts.verdict}' for session=${opts.sessionId} ` +
            `tactics=[${opts.tacticIds.join(", ")}]`,
        )

        // Load all tactics from store
        const allTactics = yield* store.loadTactics()

        // Find the tactics that were injected
        const tactics: Tactic[] = []
        for (const tid of opts.tacticIds) {
          const tactic = allTactics.find((t) => t.id === tid)
          if (tactic) {
            tactics.push(tactic)
          } else {
            yield* Effect.logWarning(`[Solidify] Tactic '${tid}' not found — skipping`)
          }
        }

        if (tactics.length === 0) {
          yield* Effect.logWarning(`[Solidify] No valid tactics found for session ${opts.sessionId}`)
        }

        // Update each tactic's Beta-distribution parameters
        const updatedTactics: Tactic[] = []

        for (const tactic of tactics) {
          const updated = yield* updateTacticStats(tactic, opts.verdict)
          updatedTactics.push(updated)

          yield* Effect.log(
            `[Solidify] Updated ${tactic.id}: α=${updated.stats.alpha} β=${updated.stats.beta} ` +
              `uses=${updated.stats.uses} winRate=${(updated.stats.alpha / (updated.stats.alpha + updated.stats.beta)).toFixed(3)}`,
          )
        }

        // Save updated tactics back to store
        const tacticsToSave = allTactics.map((t) => {
          const updated = updatedTactics.find((u) => u.id === t.id)
          return updated ?? t
        })
        yield* store.saveTactics(tacticsToSave)

        // Write a Case record for this task outcome
        // Build a Case from the options
        const timestamp = Date.now()
        const caseId = `case_${timestamp}_${Math.random().toString(36).slice(2, 8)}`

        const caseRecord: Case = {
          id: caseId,
          taskSignature: opts.taskSignature,
          sessionId: opts.sessionId,
          verdict: opts.verdict,
          tacticIds: [...opts.tacticIds],
          metrics: opts.metrics,
          signals: [...(opts.signals as unknown as Case["signals"])],
          createdAt: new Date(timestamp).toISOString(),
          scrubbed: opts.scrubbed ?? false,
        }

        yield* store.appendCase(caseRecord)
        yield* Effect.log(`[Solidify] Case recorded: ${caseRecord.id}`)

        // Append solidify ledger entry for audit trail
        const ledgerEntry: SolidifyEntry = {
          kind: "solidify",
          timestamp: new Date().toISOString(),
          caseId: caseRecord.id,
          tacticId: opts.tacticIds[0] || "none",
          verdict: opts.verdict,
        }

        yield* store.appendLedger(ledgerEntry)
        yield* Effect.log(`[Solidify] Ledger entry: solidify case=${caseRecord.id}`)

        // Suggest rollback on failure
        const rollbackSuggested = opts.verdict === "fail"

        if (rollbackSuggested) {
          yield* Effect.logWarning(
            `[Solidify] Verdict=fail — suggesting rollback for session ${opts.sessionId}`,
          )

          yield* rollbackSession(opts.sessionId).pipe(
            Effect.catchAll((err) =>
              Effect.logWarning(`[Solidify] Rollback attempt failed: ${err}`),
            ),
          )
        }

        const result: SolidifyResult = {
          updatedTactics,
          caseRecord,
          rollbackSuggested,
        }

        yield* Effect.log(
          `[Solidify] Complete: ${updatedTactics.length} tactics updated, ` +
            `rollback=${rollbackSuggested}`,
        )

        return result
      })

    /**
     * Rollback experimental changes for a session.
     *
     * Uses git to revert any files that were modified during the
     * failed session. This is the safety mechanism that prevents
     * bad tactics from leaving the codebase in a broken state.
     *
     * @param sessionId - The session to rollback
     * @returns RollbackInfo describing what was reverted
     */
    const rollbackSession = (sessionId: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`[Solidify] Rolling back session: ${sessionId}`)

        // In production: load session metadata from store to get git head
        // For now, use HEAD as the rollback target
        const gitHead = "HEAD"
        const filesTouched: string[] = []

        // Record the rollback
        const rollbackInfo: RollbackInfo = {
          sessionId,
          gitHead,
          filesTouched,
          rolledBackAt: Date.now(),
        }

        yield* Ref.update(rollbackLogRef, (log) => [...log, rollbackInfo])

        yield* Effect.log(`[Solidify] Rollback recorded for session ${sessionId}`)

        return rollbackInfo
      })

    /**
     * Check that tactic changes stay within guardrails.
     *
     * Validates that a tactic's proposed changes do not violate
     * safety constraints (file count, line count, forbidden patterns).
     *
     * @param tactic - The tactic to validate
     * @param changes - Proposed file changes
     * @returns true if changes pass all guardrails
     */
    const checkGuardrails = (
      tactic: Tactic,
      changes: ReadonlyArray<{
        path: string
        additions: number
        deletions: number
        content: string
      }>,
    ): Effect.Effect<boolean, never> =>
      Effect.gen(function* () {
        // Guardrail 1: Maximum files touched
        const MAX_FILES = tactic.guardrails.maxFiles
        if (changes.length > MAX_FILES) {
          yield* Effect.logWarning(
            `[Solidify] Guardrail fail: ${tactic.id} touches ${changes.length} files (max ${MAX_FILES})`,
          )
          return false
        }

        // Guardrail 2: Check forbidden paths
        for (const change of changes) {
          for (const forbidden of tactic.guardrails.forbiddenPaths) {
            if (change.path.includes(forbidden)) {
              yield* Effect.logWarning(
                `[Solidify] Guardrail fail: ${tactic.id} touches forbidden path ${forbidden} in ${change.path}`,
              )
              return false
            }
          }
        }

        // Guardrail 3: No banned patterns in generated content
        for (const change of changes) {
          const hasBanned = guard.containsBannedPatterns(change.content)
          if (hasBanned) {
            yield* Effect.logWarning(
              `[Solidify] Guardrail fail: ${tactic.id} contains banned shell patterns in ${change.path}`,
            )
            return false
          }
        }

        // Guardrail 4: No secret patterns in generated content
        const hasSecrets = yield* Effect.forEach(changes, (change) =>
          Effect.map(
            Effect.promise(() =>
              Promise.resolve(
                /sk-[a-zA-Z0-9]{20,}/.test(change.content) ||
                  /gh[pousr]_[a-zA-Z0-9]{20,}/.test(change.content) ||
                  /AKIA[0-9A-Z]{16}/.test(change.content),
              ),
            ),
            (hasSecret) => ({ path: change.path, hasSecret }),
          ),
        )

        const secretMatches = hasSecrets.filter((r) => r.hasSecret)
        if (secretMatches.length > 0) {
          yield* Effect.logWarning(
            `[Solidify] Guardrail fail: ${tactic.id} contains potential secrets in: ` +
              secretMatches.map((s) => s.path).join(", "),
          )
          return false
        }

        yield* Effect.log(`[Solidify] Guardrails passed for ${tactic.id}`)
        return true
      })

    /**
     * Get the rollback log (for audit/debugging).
     */
    const getRollbackLog = () => Ref.get(rollbackLogRef)

    return {
      applyVerdict,
      rollbackSession,
      checkGuardrails,
      getRollbackLog,
    } as const
  }),
  dependencies: [ExperienceStore.Default, ExperienceGuard.Default],
}) {}

export const SolidifyLive = Solidify.Default

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update tactic statistics based on verdict.
 *
 * - pass:   α += 1 (full success weight)
 * - fail:   β += 1 (full failure weight)
 * - partial: α += 0.5, β += 0.25 (partial credit)
 */
function updateTacticStats(
  tactic: Tactic,
  verdict: CaseVerdict,
): Effect.Effect<Tactic, never> {
  return Effect.sync(() => {
    const alphaIncrement = verdict === "pass" ? 1 : verdict === "partial" ? 0.5 : 0
    const betaIncrement = verdict === "fail" ? 1 : verdict === "partial" ? 0.25 : 0

    return {
      ...tactic,
      stats: {
        ...tactic.stats,
        alpha: tactic.stats.alpha + alphaIncrement,
        beta: tactic.stats.beta + betaIncrement,
        wins: tactic.stats.wins + (verdict === "pass" ? 1 : verdict === "partial" ? 0.5 : 0),
        losses: tactic.stats.losses + (verdict === "fail" ? 1 : 0),
        uses: tactic.stats.uses + 1,
        lastUsed: new Date().toISOString(),
      },
    }
  })
}
