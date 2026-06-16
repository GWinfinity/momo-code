/**
 * Gate — Promotion Gate with Bench-Based A/B Testing
 *
 * Controls the lifecycle transitions of tactics through the promotion
 * pipeline: draft → active → promoted. Each transition requires
 * passing an evidence-based gate to prevent premature promotion
 * of unproven tactics.
 *
 * Promotion pipeline:
 * 1. draft → active:  Domain win rate > threshold (default 0.7) AND uses ≥ N (default 5)
 * 2. active → promoted: Bench A/B test (with vs without tactic) must pass ratchet
 *
 * The ratchet check ensures that promoting a tactic never causes
 * regression on existing bench tasks. This is the core safety
 * mechanism of the promotion pipeline.
 *
 * Reference: Pioneer Agent §2.6 — "The ratchet gate ensures monotonic
 * improvement. A candidate must pass all historical checkpoints."
 */
import { Effect } from "effect";
import type { Tactic, TacticStatus } from "./tactic";
import { ExperienceStore } from "./store";
/**
 * Result of an A/B test comparing task execution with and without
 * a specific tactic injected.
 */
export interface AbTestResult {
    /** pass@1 score with the tactic injected. */
    readonly withTactic: number;
    /** pass@1 score without the tactic (control). */
    readonly withoutTactic: number;
    /** Absolute improvement (with - without). */
    readonly improvement: number;
    /** Number of bench tasks evaluated. */
    readonly sampleSize: number;
    /** Per-task detailed results. */
    readonly taskDetails: ReadonlyArray<{
        taskId: string;
        withScore: number;
        withoutScore: number;
    }>;
}
/**
 * Result of a ratchet check against historical bench results.
 */
export interface RatchetCheckResult {
    /** Whether the ratchet check passed. */
    readonly passed: boolean;
    /** Number of regressions detected. */
    readonly regressionCount: number;
    /** IDs of tasks that regressed. */
    readonly regressionTasks: ReadonlyArray<string>;
    /** Score comparison details. */
    readonly comparisons: ReadonlyArray<{
        taskId: string;
        previousScore: number;
        currentScore: number;
        delta: number;
    }>;
}
/**
 * Options for the promotion gate.
 */
export interface GateOpts {
    /** Win rate threshold for draft→active (default from config). */
    readonly draftThreshold?: number;
    /** Minimum uses before promotion consideration (default from config). */
    readonly minUses?: number;
    /** Epsilon tolerance for ratchet check (default 0 tasks — strict). */
    readonly ratchetEps?: number;
    /** Bench eval set name (default "momo-bench-v1"). */
    readonly benchName?: string;
}
declare const Gate_base: Effect.Service.Class<Gate, "experience/Gate", {
    readonly effect: Effect.Effect<{
        readonly maybePromote: (tactic: Tactic, opts?: GateOpts) => Effect.Effect<TacticStatus, Error, never>;
        readonly abTestWithWithout: (tactic: Tactic, bench: string) => Effect.Effect<AbTestResult, never, never>;
        readonly ratchetCheck: (scores: AbTestResult) => Effect.Effect<RatchetCheckResult, never, never>;
        readonly maybeRetire: (tactic: Tactic) => Effect.Effect<boolean, Error, never>;
        readonly getPromotionHistory: () => Effect.Effect<readonly {
            timestamp: number;
            tacticId: string;
            fromStatus: TacticStatus;
            toStatus: TacticStatus;
            reason: string;
            abResult?: AbTestResult;
        }[], never, never>;
    }, never, ExperienceStore>;
    readonly dependencies: readonly [import("effect/Layer").Layer<ExperienceStore, never, never>];
}>;
/**
 * Gate — Bench-based A/B testing for tactic promotion.
 *
 * The gate enforces a strict promotion pipeline:
 * 1. draft → active: Requires sufficient uses and win rate
 * 2. active → promoted: Requires passing A/B test on bench
 *
 * The ratchet check ensures no regression on historical tasks.
 */
export declare class Gate extends Gate_base {
}
export declare const GateLive: import("effect/Layer").Layer<Gate, never, never>;
export {};
//# sourceMappingURL=gate.d.ts.map