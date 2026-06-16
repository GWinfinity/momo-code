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
import { Effect } from "effect";
import type { Tactic } from "./tactic";
import type { Case } from "./case";
import { ExperienceStore } from "./store";
import { ExperienceGuard } from "./guard";
import type { TrainingSample } from "../evolve/index";
/**
 * Training samples produced from experience data.
 */
export interface TrainingSamples {
    /** Gold samples from successful tactic applications. */
    readonly gold: ReadonlyArray<TrainingSample>;
    /** Hard-negative samples from failure clusters. */
    readonly hardNegatives: ReadonlyArray<TrainingSample>;
    /** Replay samples from promoted tactic reasoning chains. */
    readonly replay: ReadonlyArray<TrainingSample>;
}
/**
 * Bridge options for controlling the conversion.
 */
export interface BridgeOpts {
    /** Minimum promoted cases before pushing to curriculum (default: 10). */
    readonly minPromotedCases?: number;
    /** Ratio for hard negatives (default: 0.3). */
    readonly hardNegRatio?: number;
    /** Whether to include replay samples (default: true). */
    readonly includeReplay?: boolean;
}
/**
 * Error raised when not enough promoted cases have accumulated.
 */
export declare class InsufficientCasesError {
    readonly have: number;
    readonly need: number;
    readonly _tag = "InsufficientCasesError";
    readonly message: string;
    constructor(have: number, need: number);
}
declare const Bridge_base: Effect.Service.Class<Bridge, "experience/Bridge", {
    readonly effect: Effect.Effect<{
        readonly enqueueForFineTune: (tactic: Tactic) => Effect.Effect<number, Error, never>;
        readonly buildTrainingSamples: (cases: ReadonlyArray<Case>, tactics: ReadonlyArray<Tactic>) => Effect.Effect<TrainingSamples, never, never>;
        readonly spilloverToCurriculum: (opts?: BridgeOpts) => Effect.Effect<number, Error | InsufficientCasesError, never>;
        readonly getPendingStats: () => Effect.Effect<{
            pendingCases: number;
            pendingTactics: number;
            passCases: number;
            failCases: number;
        }, never, never>;
        readonly getBridgeLog: () => Effect.Effect<readonly {
            timestamp: number;
            action: "enqueued" | "built" | "spillover";
            caseCount: number;
            tacticCount: number;
            details: string;
        }[], never, never>;
        readonly forceSpillover: () => Effect.Effect<number, Error | InsufficientCasesError, never>;
    }, never, ExperienceStore | ExperienceGuard>;
    readonly dependencies: readonly [import("effect/Layer").Layer<ExperienceStore, never, never>, import("effect/Layer").Layer<ExperienceGuard, never, never>];
}>;
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
export declare class Bridge extends Bridge_base {
}
export declare const BridgeLive: import("effect/Layer").Layer<Bridge, never, never>;
export {};
//# sourceMappingURL=bridge.d.ts.map