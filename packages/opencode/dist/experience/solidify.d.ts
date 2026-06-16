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
import { Effect } from "effect";
import type { Tactic } from "./tactic";
import type { Case, CaseVerdict } from "./case";
import { ExperienceStore } from "./store";
import { ExperienceGuard } from "./guard";
/**
 * Verdict result from applying a task outcome.
 *
 * Contains the updated tactic records and the case that was written.
 */
export interface SolidifyResult {
    /** Tactics that were updated by this verdict. */
    readonly updatedTactics: ReadonlyArray<Tactic>;
    /** The case record that was written. */
    readonly caseRecord: Case;
    /** Whether a rollback was suggested. */
    readonly rollbackSuggested: boolean;
}
/**
 * Options for applying a verdict.
 */
export interface ApplyVerdictOpts {
    /** The session identifier. */
    readonly sessionId: string;
    /** The task signature (hash/fingerprint). */
    readonly taskSignature: string;
    /** The verdict: pass = tactic helped, fail = tactic hurt, partial = neutral. */
    readonly verdict: CaseVerdict;
    /** IDs of tactics that were injected for this task. */
    readonly tacticIds: ReadonlyArray<string>;
    /** Performance metrics for the task. */
    readonly metrics: {
        durationMs: number;
        toolCalls: number;
        retries: number;
    };
    /** Signals observed during the task. */
    readonly signals: ReadonlyArray<{
        type: string;
        confidence: number;
        timestamp: number;
    }>;
    /** Whether PII has been scrubbed. */
    readonly scrubbed?: boolean;
}
/**
 * Git rollback information for a session.
 */
export interface RollbackInfo {
    readonly sessionId: string;
    readonly gitHead: string;
    readonly filesTouched: ReadonlyArray<string>;
    readonly rolledBackAt: number;
}
declare const Solidify_base: Effect.Service.Class<Solidify, "experience/Solidify", {
    readonly effect: Effect.Effect<{
        readonly applyVerdict: (opts: ApplyVerdictOpts) => Effect.Effect<SolidifyResult, Error, never>;
        readonly rollbackSession: (sessionId: string) => Effect.Effect<RollbackInfo, never, never>;
        readonly checkGuardrails: (tactic: Tactic, changes: ReadonlyArray<{
            path: string;
            additions: number;
            deletions: number;
            content: string;
        }>) => Effect.Effect<boolean, never>;
        readonly getRollbackLog: () => Effect.Effect<readonly RollbackInfo[], never, never>;
    }, never, ExperienceStore | ExperienceGuard>;
    readonly dependencies: readonly [import("effect/Layer").Layer<ExperienceStore, never, never>, import("effect/Layer").Layer<ExperienceGuard, never, never>];
}>;
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
export declare class Solidify extends Solidify_base {
}
export declare const SolidifyLive: import("effect/Layer").Layer<Solidify, never, never>;
export {};
//# sourceMappingURL=solidify.d.ts.map