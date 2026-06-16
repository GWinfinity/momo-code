/**
 * Curriculum Synthesis — Three-slice data recipe + 5 quality controls.
 *
 * Reference: Pioneer Agent §2.3
 * - Gold 40-60%: Correct samples (from passed sessions)
 * - Hard negatives 25-35%: Similar input but different correct answer
 * - Replay 10-20%: Old training samples to prevent catastrophic forgetting
 *
 * 5 Quality Controls:
 * 1. 2-for-1 rule: Each hard-neg paired with 1 gold + 1 hard-neg
 * 2. Label balance: Any label <= 3x least common
 * 3. Context length distribution matches real inputs
 * 4. Entity diversity: Same entity value <= 2-3 times
 * 5. CoT annotation: Teacher model generates reasoning chains
 *
 * Reference: Pioneer Agent §2.3 — "The three-slice recipe provides
 * the right mix of positive examples, targeted negatives, and
 * historical replay for stable learning."
 */
import { Effect } from "effect";
import { Store } from "./store";
import type { DataSpec, TrainingSample, ConfusionCluster } from "./index";
export interface CurriculumOpts {
    readonly hardNegRatio: number;
    readonly replay: boolean;
    readonly replayRatio?: number;
    readonly goldRatio?: number;
}
declare const Curriculum_base: Effect.Service.Class<Curriculum, "evolve/Curriculum", {
    readonly effect: Effect.Effect<{
        readonly build: (spec: DataSpec, opts: CurriculumOpts) => Effect.Effect<TrainingSample[], never, never>;
        readonly synthesizeFromClusters: (clusters: ReadonlyArray<ConfusionCluster>, sessions: ReadonlyArray<{
            id: string;
            messages: unknown[];
        }>) => Effect.Effect<TrainingSample[], never, never>;
        readonly getStats: () => Effect.Effect<readonly {
            version: string;
            goldCount: number;
            hardNegCount: number;
            replayCount: number;
            total: number;
            qualityChecksPassed: number;
        }[], never, never>;
    }, never, Store>;
    readonly dependencies: readonly [import("effect/Layer").Layer<Store, never, never>];
}>;
/**
 * Curriculum service — builds the three-slice training dataset.
 *
 * The curriculum follows Pioneer Agent's recipe:
 * 1. Balance the three slices (gold, hard-negative, replay)
 * 2. Apply the 2-for-1 pairing rule for hard negatives
 * 3. Enforce label balance across failure types
 * 4. Ensure entity diversity to prevent memorization
 * 5. Annotate with Chain-of-Thought from teacher model
 */
export declare class Curriculum extends Curriculum_base {
}
export declare const CurriculumLive: import("effect/Layer").Layer<Curriculum, never, never>;
export {};
//# sourceMappingURL=curriculum.d.ts.map