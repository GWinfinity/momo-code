/**
 * Experience Fast Loop — Configuration
 *
 * All configuration is driven via MOMO_XP_* environment variables.
 * This ensures the experience loop can be tuned without code changes
 * and respects the twelve-factor app methodology.
 *
 * Modes:
 * - "balanced":  Default. Mix of exploration and exploitation.
 * - "explore":   Favor drafting new tactics from signals.
 * - "harden":    Favor promoting proven tactics, fewer drafts.
 * - "convention-only": Only learn from style/guide violations.
 *
 * Reference: Pioneer Agent §2.1 — "Configuration drives the exploration
 * vs exploitation trade-off in the learning loop."
 */
/**
 * Read the experience configuration from environment variables.
 *
 * Parses MOMO_XP_* vars with fallback defaults. Validates
 * that the MODE is one of the allowed values.
 */
function readConfig() {
    const rawMode = process.env.MOMO_XP_MODE || "balanced";
    const allowedModes = ["balanced", "explore", "harden", "convention-only"];
    const mode = allowedModes.includes(rawMode)
        ? rawMode
        : "balanced";
    return {
        AUTO: process.env.MOMO_XP_AUTO === "true",
        MODE: mode,
        INJECT_BUDGET: parseInt(process.env.MOMO_XP_INJECT_BUDGET || "2048", 10),
        PROMOTE_THRESHOLD: parseFloat(process.env.MOMO_XP_PROMOTE_THRESHOLD || "0.7"),
        MIN_USES_FOR_ACTIVE: parseInt(process.env.MOMO_XP_MIN_USES || "5", 10),
        MAX_TACTICS_PER_INJECT: parseInt(process.env.MOMO_XP_MAX_TACTICS || "6", 10),
        STAGNATION_WINDOW: parseInt(process.env.MOMO_XP_STAGNATION_WINDOW || "10", 10),
    };
}
/**
 * Experience configuration singleton.
 *
 * Loaded once at module initialization from MOMO_XP_* environment variables.
 * All experience loop services should import this config rather than
 * reading env vars directly to ensure consistent values.
 */
export const XP_CONFIG = readConfig();
/**
 * Mode-specific tuning parameters derived from the base config.
 *
 * These adjust the behavior of the selection, promotion, and distillation
 * services based on the current operating mode.
 */
export const MODE_TUNING = {
    /** Thompson sampling temperature for tactic selection. Higher = more exploration. */
    thompsonTemperature: {
        balanced: 1.0,
        explore: 1.5,
        harden: 0.7,
        "convention-only": 0.8,
    },
    /** Minimum win rate for draft→active promotion. */
    draftThreshold: {
        balanced: XP_CONFIG.PROMOTE_THRESHOLD,
        explore: XP_CONFIG.PROMOTE_THRESHOLD * 0.85,
        harden: XP_CONFIG.PROMOTE_THRESHOLD * 1.1,
        "convention-only": XP_CONFIG.PROMOTE_THRESHOLD,
    },
    /** Maximum new drafts per distillation cycle. */
    maxDraftsPerCycle: {
        balanced: 3,
        explore: 6,
        harden: 1,
        "convention-only": 2,
    },
    /** Injection budget multiplier (relative to base INJECT_BUDGET). */
    budgetMultiplier: {
        balanced: 1.0,
        explore: 1.2,
        harden: 0.8,
        "convention-only": 0.9,
    },
};
/**
 * Get mode-specific tuning values for the current configuration.
 */
export const getModeTuning = (mode = XP_CONFIG.MODE) => ({
    thompsonTemperature: MODE_TUNING.thompsonTemperature[mode],
    draftThreshold: MODE_TUNING.draftThreshold[mode],
    maxDraftsPerCycle: MODE_TUNING.maxDraftsPerCycle[mode],
    budgetMultiplier: MODE_TUNING.budgetMultiplier[mode],
});
//# sourceMappingURL=config.js.map