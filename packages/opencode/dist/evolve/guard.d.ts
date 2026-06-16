/**
 * Security & Privacy Guard for fine-tuning data.
 *
 * - Scrub secrets (tokens, keys, .env contents)
 * - Remove PII (emails, phone numbers, credit cards)
 * - Data attribution tracking
 *
 * Reference: Pioneer Agent §3.4 — "Data must be scrubbed of secrets
 * before entering the training pipeline."
 */
import { Effect } from "effect";
export interface ScrubResult {
    readonly scrubbed: boolean;
    readonly secretMatches: number;
    readonly piiMatches: number;
    readonly details: ReadonlyArray<string>;
}
export declare const Guard: {
    /**
     * Scrub secrets from dataset samples.
     * Returns a new array with secrets replaced by [REDACTED_SECRET].
     *
     * Reference: Pioneer Agent §3.4 — Data scrubbing before training.
     */
    scrubSecrets: <T extends {
        context: string;
    }>(dataset: ReadonlyArray<T>) => Effect.Effect<ReadonlyArray<T> & ScrubResult, never>;
    /**
     * Check if a string contains potential secrets (without modifying).
     */
    containsSecrets: (text: string) => Effect.Effect<boolean, never>;
    /**
     * Validate that a dataset passes all security checks before training.
     */
    validateDataset: <T extends {
        context: string;
    }>(dataset: ReadonlyArray<T>) => Effect.Effect<{
        passed: boolean;
        issues: ReadonlyArray<string>;
    }, never>;
};
//# sourceMappingURL=guard.d.ts.map