/**
 * Evaluator with Cross-Checkpoint Ratchet Gate (Pioneer Agent §2.6 / §28)
 *
 * Ratchet Rule: Candidate checkpoint C_new must pass BOTH:
 * 1. Current eval set: pass@1(C_new, bench_current) >= pass@1(C_prev, bench_current) - eps
 * 2. Historical eval set: forall previously-passed tasks t: C_new still passes t
 *
 * eps = 2 (absolute count, not percentage)
 * "Ratchet only moves forward, never backward"
 *
 * Reference: Pioneer Agent §28 — "The ratchet gate ensures monotonic
 * improvement across all historical checkpoints."
 */
import { Effect } from "effect";
import { Option } from "effect";
import type { EvalScore, MCNode } from "./index";
export interface RatchetOpts {
    readonly eps: number;
    readonly checkpoints: ReadonlyArray<string>;
}
export interface EvalResult {
    readonly score: EvalScore;
    readonly passedTasks: ReadonlyArray<string>;
    readonly failedTasks: ReadonlyArray<string>;
    readonly taskDetails: ReadonlyMap<string, {
        passed: boolean;
        confidence: number;
    }>;
}
declare const Evaluator_base: Effect.Service.Class<Evaluator, "evolve/Evaluator", {
    readonly effect: Effect.Effect<{
        readonly run: (modelId: string, evalSet: string) => Effect.Effect<EvalScore, never, never>;
        readonly runDetailed: (modelId: string, evalSet: string) => Effect.Effect<EvalResult, never, never>;
        readonly ratchetGate: (node: MCNode, opts: RatchetOpts) => Effect.Effect<boolean, never, never>;
        readonly recordCheckpoint: (modelId: string, results: Map<string, boolean>) => Effect.Effect<void, never, never>;
        readonly getCheckpoints: () => Effect.Effect<readonly string[], never, never>;
        readonly getHistory: (modelId: string) => Effect.Effect<Option.None<Map<string, boolean>> | Option.Some<Map<string, boolean>>, never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Evaluator service — runs evaluation and enforces the ratchet gate.
 *
 * The ratchet gate is the core safety mechanism: it ensures that
 * a candidate model never regress on previously-solved tasks.
 *
 * Reference: Pioneer Agent §2.6 — "The ratchet gate compares the
 * candidate against all historical checkpoints, not just the most recent."
 */
export declare class Evaluator extends Evaluator_base {
}
export declare const EvaluatorLive: import("effect/Layer").Layer<Evaluator, never, never>;
export {};
//# sourceMappingURL=evaluator.d.ts.map