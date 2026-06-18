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
import { Effect, Option } from "effect"
import { Guard as EvolveGuard } from "../evolve/guard"
import type { Tactic } from "./tactic"
import type { Case } from "./case"
import { XP_CONFIG } from "./config"

// ═══════════════════════════════════════════════════════════════════════════════
// Command Validation Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Allowed command prefixes for check commands.
 *
 * Only these well-known, safe commands may be executed as part of
 * tactic verification. Any other command prefix is rejected.
 */
export const ALLOWED_CHECK_PREFIXES = [
  "node",
  "npm",
  "pnpm",
  "npx",
  "tsc",
  "eslint",
] as const

/**
 * Banned shell patterns that indicate command injection risk.
 *
 * These patterns are used to detect and reject potentially dangerous
 * shell metacharacters that could lead to command injection.
 */
export const BANNED_SHELL_PATTERNS: ReadonlyArray<RegExp> = [
  /`/, // Backtick substitution
  /\$\(/, // Command substitution
  /;/, // Command separator
  /&/, // Background / AND operator
  /\|/, // Pipe
  />/, // Redirection (overwrite)
  /</, // Redirection (input)
]

/**
 * Maximum duration for a check command in milliseconds.
 *
 * Commands that exceed this duration are terminated and considered failed.
 * This prevents hung processes from blocking the experience loop.
 */
export const MAX_CHECK_DURATION_MS = 180_000

/**
 * Error raised when a check command fails security validation.
 */
export class GuardViolationError {
  readonly _tag = "GuardViolationError"
  constructor(
    readonly reason: string,
    readonly command: string,
  ) {}
}

/**
 * Error raised when a tactic stagnation loop is detected.
 */
export class StagnationError {
  readonly _tag = "StagnationError"
  constructor(
    readonly tacticId: string,
    readonly details: string,
  ) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// ExperienceGuard Service
// ═══════════════════════════════════════════════════════════════════════════════

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
export class ExperienceGuard extends Effect.Service<ExperienceGuard>()(
  "experience/Guard",
  {
    effect: Effect.gen(function* () {
      // Track recent command validations for audit logging
      const validationLog: Array<{
        timestamp: number
        command: string
        allowed: boolean
        reason?: string
      }> = []

      /**
       * Validate a check command against the security whitelist.
       *
       * Checks:
       * 1. Command starts with an allowed prefix
       * 2. No banned shell metacharacters present
       * 3. Command length is reasonable
       * 4. No path traversal sequences
       *
       * @param cmd - The command string to validate
       * @returns void on success, fails with GuardViolationError on rejection
       */
      const validateCheckCommand = (cmd: string): Effect.Effect<void, GuardViolationError> =>
        Effect.gen(function* () {
          // Check 1: Non-empty command
          if (!cmd || cmd.trim().length === 0) {
            const err = new GuardViolationError("Empty command", cmd)
            validationLog.push({ timestamp: Date.now(), command: cmd, allowed: false, reason: err.reason })
            return yield* Effect.fail(err)
          }

          const trimmed = cmd.trim()

          // Check 2: Command length sanity
          if (trimmed.length > 2000) {
            const err = new GuardViolationError("Command exceeds maximum length (2000 chars)", cmd)
            validationLog.push({ timestamp: Date.now(), command: cmd, allowed: false, reason: err.reason })
            return yield* Effect.fail(err)
          }

          // Check 3: Starts with allowed prefix
          const firstToken = trimmed.split(/\s+/)[0]
          const hasAllowedPrefix = ALLOWED_CHECK_PREFIXES.some(
            (prefix) => firstToken === prefix || firstToken.startsWith(prefix),
          )

          if (!hasAllowedPrefix) {
            const err = new GuardViolationError(
              `Command prefix '${firstToken}' not in allowed list: ${ALLOWED_CHECK_PREFIXES.join(", ")}`,
              cmd,
            )
            validationLog.push({ timestamp: Date.now(), command: cmd, allowed: false, reason: err.reason })
            return yield* Effect.fail(err)
          }

          // Check 4: No banned shell patterns
          for (const pattern of BANNED_SHELL_PATTERNS) {
            if (pattern.test(trimmed)) {
              const err = new GuardViolationError(
                `Command contains banned shell pattern: ${pattern.source}`,
                cmd,
              )
              validationLog.push({ timestamp: Date.now(), command: cmd, allowed: false, reason: err.reason })
              return yield* Effect.fail(err)
            }
          }

          // Check 5: No path traversal
          if (trimmed.includes("..") || trimmed.includes("~")) {
            const err = new GuardViolationError("Path traversal sequences not allowed", cmd)
            validationLog.push({ timestamp: Date.now(), command: cmd, allowed: false, reason: err.reason })
            return yield* Effect.fail(err)
          }

          // Check 6: No environment variable expansion
          if (/\$[A-Z_][A-Z0-9_]*/i.test(trimmed)) {
            const err = new GuardViolationError("Environment variable expansion not allowed", cmd)
            validationLog.push({ timestamp: Date.now(), command: cmd, allowed: false, reason: err.reason })
            return yield* Effect.fail(err)
          }

          // All checks passed
          validationLog.push({ timestamp: Date.now(), command: cmd, allowed: true })
          yield* Effect.log(`[Guard] Command validated: ${firstToken}...`)
        })

      /**
       * Detect tactic stagnation — fix-reapply loops.
       *
       * A tactic is considered stagnated when:
       * 1. The same failure signature appears repeatedly
       * 2. The same tactic is applied each time
       * 3. There is no measurable improvement over the stagnation window
       *
       * When stagnation is detected, the tactic should be frozen
       * to prevent the loop from continuing.
       *
       * @param tactic - The tactic to check for stagnation
       * @param recentCases - Recent cases involving this tactic
       * @returns Option.Some(StagnationError) if frozen, Option.none() otherwise
       */
      const checkStagnation = (
        tactic: Tactic,
        recentCases: ReadonlyArray<Case>,
      ): Effect.Effect<Option.Option<StagnationError>, never> =>
        Effect.gen(function* () {
          // Not enough cases to detect stagnation
          if (recentCases.length < XP_CONFIG.STAGNATION_WINDOW) {
            return Option.none()
          }

          // Take the most recent window of cases
          const window = recentCases.slice(-XP_CONFIG.STAGNATION_WINDOW)

          // Count failures
          const failureCases = window.filter((c) => c.verdict === "fail")
          const failureRate = failureCases.length / window.length

          // If failure rate is below 50%, no stagnation
          if (failureRate < 0.5) {
            return Option.none()
          }

          // Check if failure signatures are repeating
          // Use signal types as failure signature proxy
          const failureSignatures = failureCases.map((c) =>
            c.signals.map((s) => s.type).join(","),
          )
          const signatureCounts = new Map<string, number>()

          for (const sig of failureSignatures) {
            signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1)
          }

          // Find the dominant failure signature
          let dominantSig = "unknown"
          let dominantCount = 0

          for (const [sig, count] of signatureCounts) {
            if (count > dominantCount) {
              dominantSig = sig
              dominantCount = count
            }
          }

          // If the same signature appears in >70% of failures, it's stagnated
          const stagnationThreshold = Math.floor(failureCases.length * 0.7)

          if (dominantCount >= stagnationThreshold) {
            const err = new StagnationError(
              tactic.id,
              `Tactic '${tactic.id}' stagnated: ${dominantCount}/${failureCases.length} failures ` +
                `have signature '${dominantSig}'. Failure rate: ${(failureRate * 100).toFixed(1)}%`,
            )
            yield* Effect.logWarning(`[Guard] Stagnation detected: ${err.details}`)
            return Option.some(err)
          }

          return Option.none()
        })

      /**
       * Deduplicate signals within a time window.
       *
       * Removes duplicate signals that occur within the specified
       * window (in milliseconds). Two signals are duplicates if they
       * have the same signature and occur within the window.
       *
       * @param signals - Array of signals to deduplicate
       * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
       * @returns Deduplicated signal array
       */
      const deduplicateSignals = <T extends { type: string; timestamp: number }>(
        signals: ReadonlyArray<T>,
        windowMs: number = 60_000,
      ): Effect.Effect<ReadonlyArray<T>, never> =>
        Effect.sync(() => {
          if (signals.length === 0) return []

          // Sort by timestamp ascending
          const sorted = [...signals].sort((a, b) => a.timestamp - b.timestamp)
          const result: T[] = []
          const lastSeen = new Map<string, number>()

          for (const signal of sorted) {
            const prevTime = lastSeen.get(signal.type)

            if (prevTime === undefined || signal.timestamp - prevTime > windowMs) {
              // New unique signal (first occurrence or outside window)
              result.push(signal)
              lastSeen.set(signal.type, signal.timestamp)
            }
            // else: duplicate within window, skip
          }

          return result
        })

      /**
       * Scrub secrets and PII from data before storing.
       *
       * Delegates to the evolve/ Guard module for actual scrubbing.
       * This ensures consistent secret detection across both loops.
       *
       * @param data - Array of data objects with context strings to scrub
       * @returns Scrubbed data array with secrets replaced
       */
      const scrubBeforeStore = <T extends { context: string }>(
        data: ReadonlyArray<T>,
      ): Effect.Effect<ReadonlyArray<T>, never> =>
        Effect.gen(function* () {
          yield* Effect.log(`[Guard] Scrubbing ${data.length} records before storage...`)
          const scrubbed = yield* EvolveGuard.scrubSecrets(data)
          yield* Effect.log(`[Guard] Scrub complete: ${scrubbed.secretMatches} secrets, ${scrubbed.piiMatches} PII items redacted`)
          return scrubbed
        })

      /**
       * Check if a string contains any banned shell patterns.
       *
       * Lightweight check for use in hot paths where the full
       * validateCheckCommand is not needed.
       *
       * @param text - Text to check
       * @returns true if banned patterns found
       */
      const containsBannedPatterns = (text: string): boolean => {
        for (const pattern of BANNED_SHELL_PATTERNS) {
          if (pattern.test(text)) return true
        }
        return false
      }

      /**
       * Get recent validation log entries (for debugging/audit).
       *
       * @param limit - Maximum entries to return
       * @returns Effect of recent validation log entries
       */
      const getValidationLog = (limit: number = 50) =>
        Effect.sync(() => validationLog.slice(-limit))

      return {
        validateCheckCommand,
        checkStagnation,
        deduplicateSignals,
        scrubBeforeStore,
        containsBannedPatterns,
        getValidationLog,
      } as const
    }),
  },
) {}

export const ExperienceGuardLive = ExperienceGuard.Default
