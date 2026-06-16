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

import type { Signal, SignalType } from "../evolve/signals"

// Re-export types (isolatedModules requires `export type` for type-only re-exports)
export type {
	/** A single observation extracted from a coding session trajectory. */
	Signal,
	/** Discriminated union of all signal types the agent can emit. */
	SignalType,
	/** Additional context attached to a signal (tool name, exit code, file path, etc.). */
	SignalMetadata,
	/** Outcome classification: pass, fail, or partial. */
	Verdict,
} from "../evolve/signals"

// Re-export values
export {
	/** Factory functions for creating signals from common events (exit codes, edits, corrections). */
	SignalScorer,
	/** Namespace object collecting all signal-related utilities. */
	Signals,
	/** Schema-validated Signal struct for runtime parsing/validation. */
	SignalSchema,
} from "../evolve/signals"

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
	readonly types: SignalType[]

	/** Minimum confidence threshold (0–1). Signals below this are ignored. */
	readonly minConfidence: number

	/**
	 * Optional scope filter — repo path, language tag (e.g. "lang:typescript"),
	 * or "global" for universal matching.
	 */
	readonly scope?: string

	/**
	 * Optional context regex or keyword for fine-grained matching.
	 * Checked against signal metadata (filePath, userMessage, language).
	 */
	readonly matchContext?: string
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
export function matchSignalPattern(
	signal: Signal,
	pattern: SignalPattern,
): boolean {
	// 1. Type must be in the allowed set
	if (!pattern.types.includes(signal.type)) {
		return false
	}

	// 2. Confidence must meet threshold
	if (signal.confidence < pattern.minConfidence) {
		return false
	}

	// 3. Scope filter — check language, file path, or global
	if (pattern.scope && pattern.scope !== "global") {
		const lang = signal.metadata.language
		const filePath = signal.metadata.filePath
		const scope = pattern.scope

		// Language scope: "lang:typescript" matches metadata.language "typescript"
		if (scope.startsWith("lang:")) {
			const targetLang = scope.slice(5)
			if (lang !== targetLang) {
				return false
			}
		} else if (filePath) {
			// Repo path scope: check if file is within the scope path
			if (!filePath.includes(scope)) {
				return false
			}
		} else {
			// No file path to match against — scope filter fails
			return false
		}
	}

	// 4. Context keyword/regex match against metadata
	if (pattern.matchContext) {
		const haystack = [
			signal.metadata.userMessage,
			signal.metadata.filePath,
			signal.metadata.language,
			signal.metadata.toolName,
		]
			.filter(Boolean)
			.join(" ")

		if (!haystack.toLowerCase().includes(pattern.matchContext.toLowerCase())) {
			return false
		}
	}

	return true
}
