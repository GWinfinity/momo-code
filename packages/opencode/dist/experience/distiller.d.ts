/**
 * Distiller — Distillation phase of the fast evolution loop.
 *
 * Converts successful trajectories into draft Tactics and failure
 * clusters into negative constraints. Includes dedup to prevent
 * asset bloat.
 *
 * Reference: KEP §44.2 — Distill
 */
import { Effect } from "effect";
import type { Signal } from "../evolve/signals";
import type { Tactic } from "./tactic";
import type { SignalPattern } from "./signals";
export interface NegativeConstraint {
    readonly id: string;
    readonly description: string;
    readonly triggerPatterns: SignalPattern[];
    readonly guardrailAddition: string;
}
export interface DistillResult {
    readonly tactics: Tactic[];
    readonly constraints: NegativeConstraint[];
    readonly summary: string;
    readonly dedupHitCount: number;
    readonly newCount: number;
}
declare const Distiller_base: Effect.Service.Class<Distiller, "experience/Distiller", {
    readonly effect: Effect.Effect<{
        readonly distill: (signals: ReadonlyArray<Signal>, opts?: {
            dedup?: boolean;
        }, existing?: ReadonlyArray<Tactic>) => Effect.Effect<DistillResult, never, never>;
        readonly distillSuccessPattern: (signals: ReadonlyArray<Signal>, toolName: string) => Tactic;
        readonly distillFailureCluster: (signals: ReadonlyArray<Signal>) => NegativeConstraint;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
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
export declare class Distiller extends Distiller_base {
}
export declare const DistillerLive: import("effect/Layer").Layer<Distiller, never, never>;
export {};
//# sourceMappingURL=distiller.d.ts.map