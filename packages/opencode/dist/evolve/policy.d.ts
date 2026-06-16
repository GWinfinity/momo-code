/**
 * Iterative Strategy Decision Tree (Pioneer Agent §2.4 / §21.4)
 *
 * Classification thresholds:
 *   pass@1 < 0.80  → Data problem → Rebuild dataset
 *   0.80–0.95      → Optimization problem → Tune hyperparameters
 *   > 0.95          → Finishing → Surgical sample addition
 *   Regression      → Rollback immediately
 *
 * Reference: Pioneer Agent §21.4 — "The policy maps eval scores to
 * actions: data rebuild, hyperparameter tuning, or surgical addition."
 */
import { Effect } from "effect";
import type { EvalScore } from "./index";
export type PolicyAction = {
    readonly _tag: "rebuild-data";
    readonly reason: string;
} | {
    readonly _tag: "tune-hyperparams";
    readonly reason: string;
    readonly suggestedLoraRank?: number;
    readonly suggestedLr?: number;
} | {
    readonly _tag: "surgical";
    readonly reason: string;
    readonly targetClusters: ReadonlyArray<string>;
} | {
    readonly _tag: "rollback";
    readonly reason: string;
    readonly previousScore: number;
    readonly currentScore: number;
} | {
    readonly _tag: "promote";
    readonly reason: string;
};
declare const Policy_base: Effect.Service.Class<Policy, "evolve/Policy", {
    readonly effect: Effect.Effect<{
        readonly classify: (score: EvalScore) => Effect.Effect<PolicyAction, never>;
        readonly isStagnated: (threshold: number) => Effect.Effect<boolean, never>;
        readonly getHistory: () => Effect.Effect<ReadonlyArray<EvalScore>, never>;
        readonly reset: () => Effect.Effect<void, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Policy service — classifies eval scores and decides next actions.
 *
 * Maintains internal state across iterations to detect stagnation
 * and regression trends.
 */
export declare class Policy extends Policy_base {
}
export declare const PolicyLive: import("effect/Layer").Layer<Policy, never, never>;
export {};
//# sourceMappingURL=policy.d.ts.map