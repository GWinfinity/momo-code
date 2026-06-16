/**
 * Case — a successful (or failed) task record in the experience system.
 *
 * Cases capture the outcome of applying tactics to a specific task.
 * They serve as training material for the slow loop (`/fine-tune`)
 * and as validation evidence for tactic effectiveness in the fast loop.
 *
 * Each case links a task signature (what was being done), the tactics
 * that were injected, the signals that fired, and the final verdict.
 * This creates a complete feedback loop for continuous improvement.
 *
 * @module experience/case
 */
/**
 * Create a new Case with auto-generated `id` and `createdAt`.
 *
 * The ID format is `case_<timestamp>_<randomHex>` for chronological
 * ordering and uniqueness. The `createdAt` field is set to the
 * current time in ISO 8601 format.
 *
 * @param params - All case fields except `id` and `createdAt`
 * @returns A complete Case ready for persistence
 *
 * @example
 * ```typescript
 * const c = createCase({
 *   taskSignature: "sha256:abc123...",
 *   sessionId: "sess_20240115_001",
 *   tacticIds: ["tac_global_a3f7e2b1"],
 *   verdict: "pass",
 *   metrics: { durationMs: 45000, toolCalls: 12, retries: 1 },
 *   signals: [signal1, signal2],
 *   scrubbed: true,
 * })
 * ```
 */
export function createCase(params) {
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).slice(2, 8);
    const id = `case_${timestamp}_${randomHex}`;
    const createdAt = new Date(timestamp).toISOString();
    return {
        id,
        taskSignature: params.taskSignature,
        sessionId: params.sessionId,
        tacticIds: params.tacticIds,
        verdict: params.verdict,
        metrics: params.metrics,
        signals: params.signals,
        createdAt,
        scrubbed: params.scrubbed,
    };
}
//# sourceMappingURL=case.js.map