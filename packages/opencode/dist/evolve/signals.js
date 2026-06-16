/**
 * Signal definitions and scoring for coding agent trajectories.
 *
 * Coding-specific advantage: verdict 'v' comes from test/compile exit codes,
 * which is free and objective — no LLM-as-judge needed for most samples.
 *
 * Reference: Pioneer Agent §2.1 — Signal extraction from trajectories
 */
import { Schema } from "effect";
/**
 * Schema-validated signal for runtime validation.
 */
export const SignalSchema = Schema.Struct({
    sessionId: Schema.String,
    timestamp: Schema.DateFromNumber,
    type: Schema.Literal("test-pass", "test-fail", "compile-error", "lint-error", "edit-accepted", "edit-rejected", "user-correction", "retry-loop", "post-hoc-edit"),
    verdict: Schema.Literal("pass", "fail", "partial"),
    confidence: Schema.Number,
    metadata: Schema.Struct({
        toolName: Schema.optional(Schema.String),
        exitCode: Schema.optional(Schema.Number),
        filePath: Schema.optional(Schema.String),
        language: Schema.optional(Schema.String),
        retryCount: Schema.optional(Schema.Number),
        userMessage: Schema.optional(Schema.String),
    }),
});
export const SignalScorer = {
    /**
     * Test/compile exit code → strong objective signal.
     * Coding advantage: exit codes are free, objective verdicts.
     *
     * Reference: Pioneer Agent §2.1 — "The verdict signal v is free because
     * test outcomes are already computed during normal agent operation."
     */
    fromExitCode: (exitCode, toolName) => ({
        sessionId: "", // filled by caller
        timestamp: new Date(),
        type: exitCode === 0 ? "test-pass" : toolName === "bash" ? "test-fail" : "compile-error",
        verdict: exitCode === 0 ? "pass" : "fail",
        confidence: 0.95,
        metadata: { toolName, exitCode },
    }),
    /**
     * Edit accepted/rejected → strong signal.
     * Accepted edits indicate correct reasoning; rejected edits indicate confusion.
     */
    fromEdit: (accepted) => ({
        sessionId: "",
        timestamp: new Date(),
        type: accepted ? "edit-accepted" : "edit-rejected",
        verdict: accepted ? "pass" : "fail",
        confidence: 0.9,
        metadata: {},
    }),
    /**
     * User correction → strong negative signal.
     * When the user manually fixes the agent's output, that's a clear failure signal.
     */
    fromCorrection: (userMsg) => ({
        sessionId: "",
        timestamp: new Date(),
        type: "user-correction",
        verdict: "fail",
        confidence: 0.85,
        metadata: { userMessage: userMsg },
    }),
    /**
     * Retry loop → confusion indicator.
     * Multiple retries on the same tool call suggest the agent is stuck or confused.
     */
    fromRetries: (count) => ({
        sessionId: "",
        timestamp: new Date(),
        type: "retry-loop",
        verdict: count > 3 ? "fail" : "partial",
        confidence: Math.min(count / 5, 0.8),
        metadata: { retryCount: count },
    }),
    /**
     * Post-hoc edit detected — user changed agent output after the fact.
     * Strong negative signal that the initial output was incorrect.
     */
    fromPostHocEdit: (original, corrected) => ({
        sessionId: "",
        timestamp: new Date(),
        type: "post-hoc-edit",
        verdict: "fail",
        confidence: 0.88,
        metadata: { userMessage: `Original: ${original.slice(0, 200)} → Corrected: ${corrected.slice(0, 200)}` },
    }),
};
/**
 * Aggregate signals into a quality score for a session.
 * Higher = better training material.
 */
export function scoreSessionQuality(signals) {
    if (signals.length === 0)
        return 0.5;
    const weights = {
        "test-pass": 1.0,
        "test-fail": -1.0,
        "compile-error": -0.8,
        "lint-error": -0.5,
        "edit-accepted": 0.9,
        "edit-rejected": -0.9,
        "user-correction": -1.0,
        "retry-loop": -0.6,
        "post-hoc-edit": -0.95,
    };
    const total = signals.reduce((sum, s) => {
        return sum + weights[s.type] * s.confidence;
    }, 0);
    // Normalize to 0-1 range
    return Math.max(0, Math.min(1, 0.5 + total / signals.length));
}
/**
 * Pair a rejected action with its correction to form a preference pair (DPO)
 * or (context, correct-action) for SFT.
 *
 * Reference: Pioneer Agent §2.2 — "Each rejected action is paired with
 * the correct action to form a training sample."
 */
export function createTrainingPair(rejected, chosen) {
    return { rejected, chosen };
}
/**
 * Create a Direct Preference Optimization (DPO) pair from a confusion cluster.
 * The rejected output is what the agent did; the chosen output is the correction.
 */
export function createDpoPair(prompt, rejected, chosen, clusterName) {
    return { prompt, rejected, chosen, cluster: clusterName };
}
/**
 * Signals namespace — collects all signal-related functionality.
 */
export const Signals = {
    Scorer: SignalScorer,
    scoreSessionQuality,
    createTrainingPair,
    createDpoPair,
    Schema: SignalSchema,
};
//# sourceMappingURL=signals.js.map