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
 * Experience loop operating mode.
 *
 * - balanced:       Default mix of exploration and exploitation.
 * - explore:        Aggressively draft new tactics from observations.
 * - harden:         Conservative — only promote well-proven tactics.
 * - convention-only: Restrict learning to style/guide violations.
 */
export type XpMode = "balanced" | "explore" | "harden" | "convention-only";
/**
 * Parsed experience configuration from environment variables.
 *
 * All values have sensible defaults so the loop works out-of-the-box
 * without any environment configuration.
 */
export interface XpConfig {
    /** Whether the experience loop runs automatically without confirmation. */
    readonly AUTO: boolean;
    /** Operating mode: balanced | explore | harden | convention-only */
    readonly MODE: XpMode;
    /** Token budget for tactic injection into prompts (characters). */
    readonly INJECT_BUDGET: number;
    /** Minimum win-rate threshold for draft→active promotion. */
    readonly PROMOTE_THRESHOLD: number;
    /** Minimum number of uses before a draft tactic can become active. */
    readonly MIN_USES_FOR_ACTIVE: number;
    /** Maximum tactics to inject per task prompt. */
    readonly MAX_TACTICS_PER_INJECT: number;
    /** Window size for stagnation detection (number of recent cases). */
    readonly STAGNATION_WINDOW: number;
}
/**
 * Experience configuration singleton.
 *
 * Loaded once at module initialization from MOMO_XP_* environment variables.
 * All experience loop services should import this config rather than
 * reading env vars directly to ensure consistent values.
 */
export declare const XP_CONFIG: XpConfig;
/**
 * Mode-specific tuning parameters derived from the base config.
 *
 * These adjust the behavior of the selection, promotion, and distillation
 * services based on the current operating mode.
 */
export declare const MODE_TUNING: {
    /** Thompson sampling temperature for tactic selection. Higher = more exploration. */
    readonly thompsonTemperature: {
        readonly balanced: 1;
        readonly explore: 1.5;
        readonly harden: 0.7;
        readonly "convention-only": 0.8;
    };
    /** Minimum win rate for draft→active promotion. */
    readonly draftThreshold: {
        readonly balanced: number;
        readonly explore: number;
        readonly harden: number;
        readonly "convention-only": number;
    };
    /** Maximum new drafts per distillation cycle. */
    readonly maxDraftsPerCycle: {
        readonly balanced: 3;
        readonly explore: 6;
        readonly harden: 1;
        readonly "convention-only": 2;
    };
    /** Injection budget multiplier (relative to base INJECT_BUDGET). */
    readonly budgetMultiplier: {
        readonly balanced: 1;
        readonly explore: 1.2;
        readonly harden: 0.8;
        readonly "convention-only": 0.9;
    };
};
/**
 * Get mode-specific tuning values for the current configuration.
 */
export declare const getModeTuning: (mode?: XpMode) => {
    thompsonTemperature: 1 | 0.8 | 0.7 | 1.5;
    draftThreshold: number;
    maxDraftsPerCycle: 1 | 2 | 3 | 6;
    budgetMultiplier: 1 | 0.8 | 0.9 | 1.2;
};
//# sourceMappingURL=config.d.ts.map