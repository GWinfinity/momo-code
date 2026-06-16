/**
 * Tactic — the core data model for momo Code's experience fast loop.
 *
 * A Tactic is a Knowledge-Embedded Procedure (KEP): a small, actionable
 * strategy distilled from successful sessions and injected into future
 * prompts when matching signals are observed.
 *
 * Each tactic carries Bayesian statistics (Beta distribution) for
 * uncertainty-aware selection, status lifecycle management, and
 * provenance tracking for auditability.
 *
 * @module experience/tactic
 */
import type { SignalPattern } from "./signals";
/**
 * Where a tactic applies. Hierarchical from most to least specific:
 * - `global`: Any repository, any language
 * - `repo`:   Specific repository (identified by path or name)
 * - `user`:   User-specific preference across all repos
 * - `lang:*`: Specific programming language (e.g. `lang:typescript`)
 */
export type TacticScope = "global" | "repo" | "user" | `lang:${string}`;
/**
 * What the tactic is trying to achieve:
 * - `convention`: Enforce a coding standard or style preference
 * - `fix`:      Address a specific class of errors/bugs
 * - `optimize`: Improve performance, reduce complexity
 * - `workflow`: Improve development workflow (testing, git, etc.)
 */
export type TacticIntent = "convention" | "fix" | "optimize" | "workflow";
/**
 * Lifecycle status of a tactic:
 * - `draft`:    Just distilled, not yet validated
 * - `active`:   In use for injection
 * - `promoted`: High-confidence, protected from retirement
 * - `retired`:  No longer injected (poor performance or superseded)
 */
export type TacticStatus = "draft" | "active" | "promoted" | "retired";
/**
 * Bayesian statistics tracking tactic performance.
 *
 * Uses a Beta(α, β) distribution where:
 * - α = 1 + wins  (prior 1 + observed successes)
 * - β = 1 + losses (prior 1 + observed failures)
 *
 * The prior of (1, 1) = uniform ensures conservative estimates with
 * little data. As observations accumulate, the posterior tightens.
 */
export interface TacticStats {
    /** Number of successful applications. */
    readonly wins: number;
    /** Number of failed applications. */
    readonly losses: number;
    /**
     * Beta distribution α parameter.
     * Starts at 1 (uniform prior), incremented on each win.
     */
    readonly alpha: number;
    /**
     * Beta distribution β parameter.
     * Starts at 1 (uniform prior), incremented on each loss.
     */
    readonly beta: number;
    /** ISO 8601 timestamp of last application. */
    readonly lastUsed: string;
    /** Total number of times this tactic has been injected. */
    readonly uses: number;
}
/**
 * Provenance metadata — tracks where a tactic came from and when.
 */
export interface TacticProvenance {
    /** Session IDs that contributed to this tactic's creation. */
    readonly fromSessions: string[];
    /** ISO 8601 timestamp of creation. */
    readonly createdAt: string;
    /** Whether PII has been scrubbed from the tactic content. */
    readonly scrubbed: boolean;
}
/**
 * Safety guardrails limiting what a tactic can affect.
 */
export interface TacticGuardrails {
    /** Maximum number of files the tactic may touch in one application. */
    readonly maxFiles: number;
    /** Paths the tactic must never modify (default: [".git", "node_modules"]). */
    readonly forbiddenPaths: string[];
    /**
     * Whether the tactic's smallest application must be reversible.
     * When true, the tactic should only make changes that can be undone.
     */
    readonly smallestReversible: boolean;
}
/**
 * Core tactic data structure — a Knowledge-Embedded Procedure (KEP).
 *
 * Tactics are the atomic unit of the experience system. Each tactic
 * represents a learned strategy: when to apply it (`triggers`), what
 * prerequisites must hold (`preconditions`), what steps to take (`steps`),
 * and how to validate the result (`checks`).
 *
 * The `stats` field enables Bayesian selection — we don't just pick the
 * tactic with the highest raw win rate, we model uncertainty and explore.
 */
export interface Tactic {
    /**
     * Unique identifier: `tac_<scope>_<slug>` where slug is a content hash.
     * Generated deterministically from scope and title via `generateTacticId`.
     */
    readonly id: string;
    /** Where this tactic applies. */
    readonly scope: TacticScope;
    /** What this tactic is trying to achieve. */
    readonly intent: TacticIntent;
    /** Human-readable one-line description. */
    readonly title: string;
    /** Signal patterns that trigger consideration of this tactic. */
    readonly triggers: SignalPattern[];
    /**
     * Prerequisites that must hold for the tactic to be applicable.
     * Examples: "has pnpm-workspace.yaml", "uses vitest", "typescript >= 5.0"
     */
    readonly preconditions: string[];
    /**
     * Strategy body — small, actionable steps.
     * Each step is a concise instruction injected into the system prompt.
     */
    readonly steps: string[];
    /** Safety guardrails limiting the tactic's scope of effect. */
    readonly guardrails: TacticGuardrails;
    /**
     * Validation commands to run after applying the tactic.
     * Whitelist: node, npm, pnpm, npx only (safe command execution).
     */
    readonly checks: string[];
    /** Bayesian performance statistics for uncertainty-aware selection. */
    readonly stats: TacticStats;
    /** Current lifecycle status. */
    readonly status: TacticStatus;
    /** Audit trail — where this tactic came from. */
    readonly provenance: TacticProvenance;
}
/**
 * Calculate the posterior mean win rate from Beta(α, β).
 *
 * Formula: α / (α + β)
 *
 * This is the expected probability of success given observed data plus
 * uniform prior. More observations → more confident estimate.
 *
 * @param stats - Tactic statistics with alpha and beta parameters
 * @returns Posterior mean in [0, 1]
 *
 * @example
 * ```typescript
 * winRate({ wins: 8, losses: 2, alpha: 9, beta: 3, lastUsed: "", uses: 10 })
 * // → 0.75 (9 / 12)
 * ```
 */
export declare function winRate(stats: TacticStats): number;
/**
 * Draw a random sample from the Beta(α, β) distribution.
 *
 * Thompson Sampling uses this for exploration: tactics are selected
 * proportionally to their probability of being the best, naturally
 * balancing exploration (uncertain tactics get sampled from a wider
 * distribution) and exploitation (high-performing tactics have tightly
 * concentrated distributions around high values).
 *
 * Uses the Gamma distribution relationship: if X ~ Gamma(α, 1) and
 * Y ~ Gamma(β, 1), then X / (X + Y) ~ Beta(α, β).
 *
 * @param stats - Tactic statistics with alpha and beta parameters
 * @returns A random sample from Beta(α, β)
 *
 * @example
 * ```typescript
 * // In tactic selection — pick the tactic with highest sample
 * const bestTactic = tactics.reduce((best, t) =>
 *   thompsonSample(t.stats) > thompsonSample(best.stats) ? t : best
 * )
 * ```
 */
export declare function thompsonSample(stats: TacticStats): number;
/**
 * Calculate the Upper Confidence Bound (UCB1) score for tactic selection.
 *
 * Formula: winRate + c * sqrt(2 * ln(totalUses) / uses)
 *
 * UCB1 optimally balances exploration and exploitation with a theoretical
 * regret bound. The bonus term grows for under-explored tactics.
 *
 * @param stats - Tactic statistics
 * @param totalUses - Total uses across all tactics in the selection set
 * @param c - Exploration constant (default: 1.414 = sqrt(2))
 * @returns UCB score (higher = better candidate for selection)
 *
 * @example
 * ```typescript
 * const totalUses = tactics.reduce((sum, t) => sum + t.stats.uses, 0)
 * const scores = tactics.map(t => ({
 *   tactic: t,
 *   score: ucbScore(t.stats, totalUses),
 * }))
 * ```
 */
export declare function ucbScore(stats: TacticStats, totalUses: number, c?: number): number;
/**
 * Check if a draft tactic can be activated.
 *
 * A tactic qualifies for activation when its Bayesian win rate exceeds
 * the threshold, indicating sufficient evidence of effectiveness.
 *
 * @param tactic - The tactic to evaluate
 * @param threshold - Minimum win rate (default: 0.6)
 * @returns `true` if the tactic can transition from draft → active
 */
export declare function canActivate(tactic: Tactic, threshold?: 0.6): boolean;
/**
 * Check if an active tactic can be promoted.
 *
 * Promotion requires both a high win rate AND sufficient sample size
 * to be confident the rate is meaningful.
 *
 * @param tactic - The tactic to evaluate
 * @param threshold - Minimum win rate (default: 0.75)
 * @returns `true` if the tactic can transition from active → promoted
 */
export declare function canPromote(tactic: Tactic, threshold?: 0.75): boolean;
/**
 * Check if an active tactic should be retired.
 *
 * Retirement occurs when a tactic consistently underperforms,
 * freeing the system from carrying ineffective strategies.
 * Promoted tactics are protected from retirement.
 *
 * @param tactic - The tactic to evaluate
 * @param threshold - Maximum win rate before retirement (default: 0.3)
 * @returns `true` if the tactic should transition to retired
 */
export declare function shouldRetire(tactic: Tactic, threshold?: 0.3): boolean;
/**
 * Generate a deterministic tactic ID from scope and title.
 *
 * Format: `tac_<scope>_<slug>` where slug is the first 8 characters
 * of the SHA-256 hash of `${scope}:${title}`.
 *
 * Deterministic IDs enable idempotent tactic creation — the same scope
 * + title always produce the same ID, preventing duplicates.
 *
 * @param scope - The tactic's scope (e.g. "global", "lang:typescript")
 * @param title - Human-readable title
 * @returns Deterministic tactic ID
 *
 * @example
 * ```typescript
 * generateTacticId("global", "Prefer const over let")
 * // → "tac_global_a3f7e2b1"
 * ```
 */
export declare function generateTacticId(scope: TacticScope, title: string): string;
//# sourceMappingURL=tactic.d.ts.map