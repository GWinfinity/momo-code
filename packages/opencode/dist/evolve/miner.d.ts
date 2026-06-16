/**
 * Diagnosis: Mine signals from session DB and cluster failure patterns.
 *
 * Extracts coding-specific signals from agent work trajectories:
 * - Test pass/fail (strong, objective)
 * - Compile/type/lint errors (strong)
 * - Edit accepted/rejected (strong)
 * - User corrections (strong negative)
 * - Retry counts → confusion clusters
 *
 * Reference: Pioneer Agent §2.1 — "Mining advantage signals from agent work logs"
 */
import { Effect, Schema } from "effect";
import { Store } from "./store";
export interface Session {
    readonly id: string;
    readonly messages: ReadonlyArray<Message>;
    readonly tools: ReadonlyArray<ToolCall>;
    readonly createdAt: number;
}
export interface Message {
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
    readonly timestamp: number;
}
export interface ToolCall {
    readonly tool: string;
    readonly input: unknown;
    readonly output: unknown;
    readonly accepted: boolean;
    readonly exitCode?: number;
    readonly retries: number;
}
export interface ConfusionCluster {
    readonly name: string;
    readonly count: number;
    readonly avgRetries: number;
    readonly signals: ReadonlyArray<Signal>;
    readonly fixable: boolean;
    readonly category: "syntax" | "semantic" | "api-usage" | "logic" | "external";
}
export interface Signal {
    readonly sessionId: string;
    readonly toolCallId: string;
    readonly type: "test-fail" | "compile-error" | "lint-error" | "user-correction" | "rejected-edit" | "retry-loop";
    readonly severity: "high" | "medium" | "low";
    readonly context: string;
    readonly correction?: string;
}
export interface Taxonomy {
    readonly clusters: ReadonlyArray<ConfusionCluster>;
    readonly totalSessions: number;
    readonly totalSignals: number;
    readonly fixableRatio: number;
}
/**
 * Schema for validated confusion clusters.
 */
export declare const ConfusionClusterSchema: Schema.Struct<{
    name: typeof Schema.String;
    count: typeof Schema.Number;
    avgRetries: typeof Schema.Number;
    signals: Schema.Array$<Schema.Struct<{
        sessionId: typeof Schema.String;
        toolCallId: typeof Schema.String;
        type: Schema.Literal<["test-fail", "compile-error", "lint-error", "user-correction", "rejected-edit", "retry-loop"]>;
        severity: Schema.Literal<["high", "medium", "low"]>;
        context: typeof Schema.String;
        correction: Schema.optional<typeof Schema.String>;
    }>>;
    fixable: typeof Schema.Boolean;
    category: Schema.Literal<["syntax", "semantic", "api-usage", "logic", "external"]>;
}>;
declare const Miner_base: Effect.Service.Class<Miner, "evolve/Miner", {
    readonly effect: Effect.Effect<{
        readonly diagnose: (sessions: ReadonlyArray<Session>) => Effect.Effect<Taxonomy, never, never>;
    }, never, Store>;
    readonly dependencies: readonly [import("effect/Layer").Layer<Store, never, never>];
}>;
/**
 * Miner service — extracts and clusters failure signals from sessions.
 *
 * Reference: Pioneer Agent §2.1 — "The diagnosis step mines advantage
 * signals from agent work logs and clusters them into a failure taxonomy."
 */
export declare class Miner extends Miner_base {
}
export declare const MinerLive: import("effect/Layer").Layer<Miner, never, never>;
export {};
//# sourceMappingURL=miner.d.ts.map