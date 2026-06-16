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
import { createHash } from "crypto";
// ---------------------------------------------------------------------------
// Bayesian statistics helpers
// ---------------------------------------------------------------------------
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
export function winRate(stats) {
    const sum = stats.alpha + stats.beta;
    if (sum === 0)
        return 0.5;
    return stats.alpha / sum;
}
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
export function thompsonSample(stats) {
    // Use Gamma distribution via Marsaglia-Tsang method
    const gamma = (shape) => {
        if (shape < 1) {
            // Use property: Gamma(a) = Gamma(a+1) * U^(1/a)
            return gamma(shape + 1) * Math.random() ** (1 / shape);
        }
        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);
        while (true) {
            let x, v;
            do {
                x = normalRandom();
                v = 1 + c * x;
            } while (v <= 0);
            v = v * v * v;
            const u = Math.random();
            if (u < 1 - 0.0331 * x * x * x * x ||
                Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                return d * v;
            }
        }
    };
    const x = gamma(stats.alpha);
    const y = gamma(stats.beta);
    return x / (x + y);
}
/**
 * Standard normal random variable (Box-Muller transform).
 */
function normalRandom() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
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
export function ucbScore(stats, totalUses, c = Math.SQRT2) {
    if (stats.uses === 0)
        return Number.POSITIVE_INFINITY;
    const exploitation = winRate(stats);
    const exploration = c * Math.sqrt((2 * Math.log(totalUses)) / stats.uses);
    return exploitation + exploration;
}
// ---------------------------------------------------------------------------
// Status transition predicates
// ---------------------------------------------------------------------------
/**
 * Default thresholds for status transitions.
 */
const DEFAULT_THRESHOLDS = {
    /** Minimum win rate to activate a draft tactic. */
    activate: 0.6,
    /** Minimum win rate + uses to promote an active tactic. */
    promote: 0.75,
    /** Maximum win rate before retiring an active tactic. */
    retire: 0.3,
};
/**
 * Minimum uses before a promotion can occur.
 * Prevents promoting tactics with too little data.
 */
const MIN_PROMOTE_USES = 5;
/**
 * Minimum uses before retirement can occur.
 * Prevents retiring tactics with too little data.
 */
const MIN_RETIRE_USES = 5;
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
export function canActivate(tactic, threshold = DEFAULT_THRESHOLDS.activate) {
    if (tactic.status !== "draft")
        return false;
    return winRate(tactic.stats) >= threshold;
}
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
export function canPromote(tactic, threshold = DEFAULT_THRESHOLDS.promote) {
    if (tactic.status !== "active")
        return false;
    return tactic.stats.uses >= MIN_PROMOTE_USES && winRate(tactic.stats) >= threshold;
}
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
export function shouldRetire(tactic, threshold = DEFAULT_THRESHOLDS.retire) {
    // Promoted tactics are protected — they must be manually demoted first
    if (tactic.status === "promoted")
        return false;
    if (tactic.status !== "active")
        return false;
    if (tactic.stats.uses < MIN_RETIRE_USES)
        return false;
    return winRate(tactic.stats) <= threshold;
}
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
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
export function generateTacticId(scope, title) {
    const hash = createHash("sha256")
        .update(`${scope}:${title}`)
        .digest("hex")
        .slice(0, 8);
    // Sanitize scope for ID usage (replace colons with hyphens)
    const scopeSlug = scope.replace(/:/g, "-");
    return `tac_${scopeSlug}_${hash}`;
}
//# sourceMappingURL=tactic.js.map