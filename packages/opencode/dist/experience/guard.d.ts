/**
 * Experience Guard — Safety Guardrails for the Fast Loop
 *
 * Provides security, anti-loop protection, and input validation
 * for the experience learning system. This is the first line of
 * defense against unsafe tactic execution and degenerate learning
 * patterns.
 *
 * Responsibilities:
 * 1. Validate check/test commands against a strict whitelist
 * 2. Detect tactic stagnation (fix-reapply loops)
 * 3. Deduplicate signals within a time window
 * 4. Scrub secrets before storing data (delegates to evolve/guard.ts)
 *
 * Reference: Pioneer Agent §3 — "Safety mechanisms must prevent
 * the agent from entering degenerate loops or executing unsafe commands."
 */
import { Effect, Option } from "effect";
import type { Tactic } from "./tactic";
import type { Case } from "./case";
/**
 * Allowed command prefixes for check commands.
 *
 * Only these well-known, safe commands may be executed as part of
 * tactic verification. Any other command prefix is rejected.
 */
export declare const ALLOWED_CHECK_PREFIXES: readonly ["node", "npm", "pnpm", "npx", "tsc", "eslint"];
/**
 * Banned shell patterns that indicate command injection risk.
 *
 * These patterns are used to detect and reject potentially dangerous
 * shell metacharacters that could lead to command injection.
 */
export declare const BANNED_SHELL_PATTERNS: ReadonlyArray<RegExp>;
/**
 * Maximum duration for a check command in milliseconds.
 *
 * Commands that exceed this duration are terminated and considered failed.
 * This prevents hung processes from blocking the experience loop.
 */
export declare const MAX_CHECK_DURATION_MS = 180000;
/**
 * Error raised when a check command fails security validation.
 */
export declare class GuardViolationError {
    readonly reason: string;
    readonly command: string;
    readonly _tag = "GuardViolationError";
    constructor(reason: string, command: string);
}
/**
 * Error raised when a tactic stagnation loop is detected.
 */
export declare class StagnationError {
    readonly tacticId: string;
    readonly details: string;
    readonly _tag = "StagnationError";
    constructor(tacticId: string, details: string);
}
declare const ExperienceGuard_base: Effect.Service.Class<ExperienceGuard, "experience/Guard", {
    readonly effect: Effect.Effect<{
        readonly validateCheckCommand: (cmd: string) => Effect.Effect<void, GuardViolationError>;
        readonly checkStagnation: (tactic: Tactic, recentCases: ReadonlyArray<Case>) => Effect.Effect<Option.Option<StagnationError>, never>;
        readonly deduplicateSignals: <T extends {
            type: string;
            timestamp: number;
        }>(signals: ReadonlyArray<T>, windowMs?: number) => Effect.Effect<ReadonlyArray<T>, never>;
        readonly scrubBeforeStore: <T extends {
            context: string;
        }>(data: ReadonlyArray<T>) => Effect.Effect<ReadonlyArray<T>, never>;
        readonly containsBannedPatterns: (text: string) => boolean;
        readonly getValidationLog: (limit?: number) => Effect.Effect<{
            timestamp: number;
            command: string;
            allowed: boolean;
            reason?: string;
        }[], never, never>;
    }, never, never>;
}>;
/**
 * ExperienceGuard — Safety guardrails for the fast learning loop.
 *
 * Validates all external-facing operations to ensure the experience
 * loop cannot be exploited or enter degenerate states.
 *
 * Services provided:
 * - validateCheckCommand: Whitelist-based command validation
 * - checkStagnation: Detect fix-reapply loops
 * - deduplicateSignals: Remove duplicate signals within window
 * - scrubBeforeStore: Secret/PII scrubbing before persistence
 */
export declare class ExperienceGuard extends ExperienceGuard_base {
}
export declare const ExperienceGuardLive: import("effect/Layer").Layer<ExperienceGuard, never, never>;
export {};
//# sourceMappingURL=guard.d.ts.map