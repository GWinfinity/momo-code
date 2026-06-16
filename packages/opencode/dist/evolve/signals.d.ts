/**
 * Signal definitions and scoring for coding agent trajectories.
 *
 * Coding-specific advantage: verdict 'v' comes from test/compile exit codes,
 * which is free and objective — no LLM-as-judge needed for most samples.
 *
 * Reference: Pioneer Agent §2.1 — Signal extraction from trajectories
 */
import { Schema } from "effect";
export type Verdict = "pass" | "fail" | "partial";
export interface Signal {
    readonly sessionId: string;
    readonly timestamp: Date;
    readonly type: SignalType;
    readonly verdict: Verdict;
    readonly confidence: number;
    readonly metadata: SignalMetadata;
}
export type SignalType = "test-pass" | "test-fail" | "compile-error" | "lint-error" | "edit-accepted" | "edit-rejected" | "user-correction" | "retry-loop" | "post-hoc-edit";
export interface SignalMetadata {
    readonly toolName?: string;
    readonly exitCode?: number;
    readonly filePath?: string;
    readonly language?: string;
    readonly retryCount?: number;
    readonly userMessage?: string;
}
/**
 * Schema-validated signal for runtime validation.
 */
export declare const SignalSchema: Schema.Struct<{
    sessionId: typeof Schema.String;
    timestamp: typeof Schema.DateFromNumber;
    type: Schema.Literal<["test-pass", "test-fail", "compile-error", "lint-error", "edit-accepted", "edit-rejected", "user-correction", "retry-loop", "post-hoc-edit"]>;
    verdict: Schema.Literal<["pass", "fail", "partial"]>;
    confidence: typeof Schema.Number;
    metadata: Schema.Struct<{
        toolName: Schema.optional<typeof Schema.String>;
        exitCode: Schema.optional<typeof Schema.Number>;
        filePath: Schema.optional<typeof Schema.String>;
        language: Schema.optional<typeof Schema.String>;
        retryCount: Schema.optional<typeof Schema.Number>;
        userMessage: Schema.optional<typeof Schema.String>;
    }>;
}>;
export declare const SignalScorer: {
    /**
     * Test/compile exit code → strong objective signal.
     * Coding advantage: exit codes are free, objective verdicts.
     *
     * Reference: Pioneer Agent §2.1 — "The verdict signal v is free because
     * test outcomes are already computed during normal agent operation."
     */
    fromExitCode: (exitCode: number, toolName: string) => Signal;
    /**
     * Edit accepted/rejected → strong signal.
     * Accepted edits indicate correct reasoning; rejected edits indicate confusion.
     */
    fromEdit: (accepted: boolean) => Signal;
    /**
     * User correction → strong negative signal.
     * When the user manually fixes the agent's output, that's a clear failure signal.
     */
    fromCorrection: (userMsg: string) => Signal;
    /**
     * Retry loop → confusion indicator.
     * Multiple retries on the same tool call suggest the agent is stuck or confused.
     */
    fromRetries: (count: number) => Signal;
    /**
     * Post-hoc edit detected — user changed agent output after the fact.
     * Strong negative signal that the initial output was incorrect.
     */
    fromPostHocEdit: (original: string, corrected: string) => Signal;
};
/**
 * Aggregate signals into a quality score for a session.
 * Higher = better training material.
 */
export declare function scoreSessionQuality(signals: ReadonlyArray<Signal>): number;
/**
 * Pair a rejected action with its correction to form a preference pair (DPO)
 * or (context, correct-action) for SFT.
 *
 * Reference: Pioneer Agent §2.2 — "Each rejected action is paired with
 * the correct action to form a training sample."
 */
export declare function createTrainingPair(rejected: {
    context: string;
    action: string;
    reason: string;
}, chosen: {
    context: string;
    action: string;
}): {
    rejected: typeof rejected;
    chosen: typeof chosen;
};
/**
 * Create a Direct Preference Optimization (DPO) pair from a confusion cluster.
 * The rejected output is what the agent did; the chosen output is the correction.
 */
export declare function createDpoPair(prompt: string, rejected: string, chosen: string, clusterName: string): {
    readonly prompt: string;
    readonly rejected: string;
    readonly chosen: string;
    readonly cluster: string;
};
/**
 * Signals namespace — collects all signal-related functionality.
 */
export declare const Signals: {
    Scorer: {
        /**
         * Test/compile exit code → strong objective signal.
         * Coding advantage: exit codes are free, objective verdicts.
         *
         * Reference: Pioneer Agent §2.1 — "The verdict signal v is free because
         * test outcomes are already computed during normal agent operation."
         */
        fromExitCode: (exitCode: number, toolName: string) => Signal;
        /**
         * Edit accepted/rejected → strong signal.
         * Accepted edits indicate correct reasoning; rejected edits indicate confusion.
         */
        fromEdit: (accepted: boolean) => Signal;
        /**
         * User correction → strong negative signal.
         * When the user manually fixes the agent's output, that's a clear failure signal.
         */
        fromCorrection: (userMsg: string) => Signal;
        /**
         * Retry loop → confusion indicator.
         * Multiple retries on the same tool call suggest the agent is stuck or confused.
         */
        fromRetries: (count: number) => Signal;
        /**
         * Post-hoc edit detected — user changed agent output after the fact.
         * Strong negative signal that the initial output was incorrect.
         */
        fromPostHocEdit: (original: string, corrected: string) => Signal;
    };
    scoreSessionQuality: typeof scoreSessionQuality;
    createTrainingPair: typeof createTrainingPair;
    createDpoPair: typeof createDpoPair;
    Schema: Schema.Struct<{
        sessionId: typeof Schema.String;
        timestamp: typeof Schema.DateFromNumber;
        type: Schema.Literal<["test-pass", "test-fail", "compile-error", "lint-error", "edit-accepted", "edit-rejected", "user-correction", "retry-loop", "post-hoc-edit"]>;
        verdict: Schema.Literal<["pass", "fail", "partial"]>;
        confidence: typeof Schema.Number;
        metadata: Schema.Struct<{
            toolName: Schema.optional<typeof Schema.String>;
            exitCode: Schema.optional<typeof Schema.Number>;
            filePath: Schema.optional<typeof Schema.String>;
            language: Schema.optional<typeof Schema.String>;
            retryCount: Schema.optional<typeof Schema.Number>;
            userMessage: Schema.optional<typeof Schema.String>;
        }>;
    }>;
};
//# sourceMappingURL=signals.d.ts.map