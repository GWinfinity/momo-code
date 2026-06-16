/**
 * Experience-specific signal extensions for the fast evolution loop.
 *
 * Re-exports core signal definitions from `../evolve/signals` and adds
 * `SignalPattern` for tactic matching — the bridge between observed signals
 * and actionable tactics.
 *
 * SignalPattern allows tactics to declaratively specify which signals they
 * respond to, enabling dynamic activation based on runtime context.
 *
 * @module experience/signals
 */
import type { Signal, SignalType } from "../evolve/signals";
export type { 
/** A single observation extracted from a coding session trajectory. */
Signal, 
/** Discriminated union of all signal types the agent can emit. */
SignalType, 
/** Additional context attached to a signal (tool name, exit code, file path, etc.). */
SignalMetadata, 
/** Outcome classification: pass, fail, or partial. */
Verdict, } from "../evolve/signals";
export { 
/** Factory functions for creating signals from common events (exit codes, edits, corrections). */
SignalScorer, 
/** Namespace object collecting all signal-related utilities. */
Signals, 
/** Schema-validated Signal struct for runtime parsing/validation. */
SignalSchema, } from "../evolve/signals";
/**
 * Pattern for matching signals against tactic triggers.
 *
 * Tactics declare `SignalPattern` arrays in their `triggers` field. When a
 * signal arrives, `matchSignalPattern` tests it against each pattern; a match
 * causes the tactic to be considered for injection.
 *
 * Patterns support filtering by signal type, minimum confidence, scope
 * (repository path, language, or "global"), and optional context keywords.
 *
 * @example
 * ```typescript
 * const pattern: SignalPattern = {
 *   types: ["test-fail", "compile-error"],
 *   minConfidence: 0.7,
 *   scope: "lang:typescript",
 *   matchContext: "type error",
 * }
 * ```
 */
export interface SignalPattern {
    /** Which signal types trigger this pattern. */
    readonly types: SignalType[];
    /** Minimum confidence threshold (0–1). Signals below this are ignored. */
    readonly minConfidence: number;
    /**
     * Optional scope filter — repo path, language tag (e.g. "lang:typescript"),
     * or "global" for universal matching.
     */
    readonly scope?: string;
    /**
     * Optional context regex or keyword for fine-grained matching.
     * Checked against signal metadata (filePath, userMessage, language).
     */
    readonly matchContext?: string;
}
/**
 * Check if a signal matches a given pattern.
 *
 * Matching rules (all must pass):
 * 1. Signal type must be in `pattern.types`
 * 2. Signal confidence ≥ `pattern.minConfidence`
 * 3. If `pattern.scope` is set, signal metadata must match (language, file path, or session scope)
 * 4. If `pattern.matchContext` is set, signal metadata must contain the keyword
 *
 * @param signal - The observed signal to test
 * @param pattern - The pattern to match against
 * @returns `true` if the signal matches all pattern constraints
 *
 * @example
 * ```typescript
 * const signal = SignalScorer.fromExitCode(1, "bash")
 * const pattern: SignalPattern = { types: ["test-fail"], minConfidence: 0.5 }
 * matchSignalPattern(signal, pattern) // → true
 * ```
 */
export declare function matchSignalPattern(signal: Signal, pattern: SignalPattern): boolean;
//# sourceMappingURL=signals.d.ts.map