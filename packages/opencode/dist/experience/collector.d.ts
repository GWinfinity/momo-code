/**
 * Collector — Observation phase of the fast evolution loop.
 *
 * Extracts signals from session DB + tool call events, computes
 * verdict v (pass/fail/partial) from objective signal outcomes.
 *
 * Reference: KEP §44.1 — Observe
 */
import { Effect } from "effect";
import type { Signal, Verdict } from "../evolve/signals";
import type { SignalPattern } from "./signals";
export type { Signal, SignalType, Verdict } from "../evolve/signals";
/** Raw observation extracted from a completed session. */
export interface SessionObservation {
    readonly sessionId: string;
    readonly signals: ReadonlyArray<Signal>;
    readonly verdict: Verdict;
    readonly durationMs: number;
    readonly toolCallCount: number;
    readonly timestamp: number;
}
/**
 * Compute overall verdict from a set of signals.
 * Weighted majority vote: pass signals vs fail signals.
 *
 * @param signals   — Extracted session signals (from evolve/signals.ts)
 * @param weights   — Optional per-signal weights (default: uniform)
 * @returns         — "pass" | "fail" | "partial"
 */
export declare function computeVerdict(signals: ReadonlyArray<Signal>, weights?: ReadonlyArray<number>): Verdict;
/**
 * Check if a signal matches a trigger pattern.
 * Used by selector.ts to find candidate tactics for a task.
 */
export declare function signalMatchesPattern(signal: Signal, pattern: SignalPattern): boolean;
declare const Collector_base: Effect.Service.Class<Collector, "experience/Collector", {
    readonly effect: Effect.Effect<{
        readonly fromSignals: (sessionId: string, signals: ReadonlyArray<Signal>) => Effect.Effect<SessionObservation, never, never>;
        readonly fromToolResult: (sessionId: string, toolName: string, exitCode: number) => Effect.Effect<SessionObservation, never, never>;
        readonly aggregate: (observations: ReadonlyArray<SessionObservation>) => Effect.Effect<{
            verdict: Verdict;
            totalSignals: number;
            passCount: number;
            failCount: number;
        }, never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Collector — extracts signals from sessions and computes verdicts.
 *
 * In production, reads from session DB (MOMO_DB). For now,
 * works with Signal arrays passed directly.
 */
export declare class Collector extends Collector_base {
}
export declare const CollectorLive: import("effect/Layer").Layer<Collector, never, never>;
//# sourceMappingURL=collector.d.ts.map