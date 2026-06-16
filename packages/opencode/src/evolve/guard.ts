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
import { Effect } from "effect"

// High-entropy secret patterns — matches API keys, tokens, passwords
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  // Generic key=value patterns
  /[a-zA-Z0-9_-]*(?:api[_-]?key|token|secret|password|auth|passwd|credential)[\s]*[=:]+[\s]*["']?[a-zA-Z0-9_\-\.]+["']?/gi,
  // OpenAI-style keys
  /sk-[a-zA-Z0-9]{20,}/g,
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  /gh[pousr]_[a-zA-Z0-9]{20,}/g,
  // AWS access keys
  /AKIA[0-9A-Z]{16}/g,
  // AWS secret keys
  /[0-9a-zA-Z/+]{40}/g,
  // Generic hex secrets (64+ chars)
  /\b[0-9a-f]{64}\b/g,
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  // Private keys
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  // .env file contents
  /^\s*[A-Z_]+=.+$/gm,
  // Connection strings with passwords
  /[a-z]+:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
  // Slack tokens
  /xox[baprs]-[a-zA-Z0-9-]+/g,
  // Discord tokens
  /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/g,
  // Stripe keys
  /sk_(live|test)_[a-zA-Z0-9]{20,}/g,
  // Generic bearer tokens
  /[Bb]earer\s+[a-zA-Z0-9_\-\.]+/g,
]

// PII patterns
const PII_PATTERNS: ReadonlyArray<RegExp> = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Phone numbers (US/International)
  /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  // Credit card numbers
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  // Social Security Numbers
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  // IP addresses
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
]

const REDACTED_SECRET = "[REDACTED_SECRET]"
const REDACTED_PII = "[REDACTED_PII]"

export interface ScrubResult {
  readonly scrubbed: boolean
  readonly secretMatches: number
  readonly piiMatches: number
  readonly details: ReadonlyArray<string>
}

export const Guard = {
  /**
   * Scrub secrets from dataset samples.
   * Returns a new array with secrets replaced by [REDACTED_SECRET].
   *
   * Reference: Pioneer Agent §3.4 — Data scrubbing before training.
   */
  scrubSecrets: <T extends { context: string }>(
    dataset: ReadonlyArray<T>,
  ): Effect.Effect<ReadonlyArray<T> & ScrubResult, never> => {
    return Effect.sync(() => {
      const details: string[] = []
      let totalSecretMatches = 0
      let totalPiiMatches = 0

      const scrubbed = dataset.map((sample) => {
        let context = sample.context

        // Scrub secrets
        for (const pattern of SECRET_PATTERNS) {
          const matches = context.match(pattern)
          if (matches) {
            totalSecretMatches += matches.length
            details.push(`Secret pattern matched ${matches.length} time(s): ${pattern.source.slice(0, 50)}...`)
            context = context.replace(pattern, REDACTED_SECRET)
          }
        }

        // Scrub PII
        for (const pattern of PII_PATTERNS) {
          const matches = context.match(pattern)
          if (matches) {
            totalPiiMatches += matches.length
            details.push(`PII pattern matched ${matches.length} time(s): ${pattern.source.slice(0, 50)}...`)
            context = context.replace(pattern, REDACTED_PII)
          }
        }

        return { ...sample, context }
      })

      const result = scrubbed as unknown as ReadonlyArray<T> & ScrubResult
      Object.defineProperty(result, "scrubbed", {
        value: totalSecretMatches > 0 || totalPiiMatches > 0,
        enumerable: false,
      })
      Object.defineProperty(result, "secretMatches", {
        value: totalSecretMatches,
        enumerable: false,
      })
      Object.defineProperty(result, "piiMatches", {
        value: totalPiiMatches,
        enumerable: false,
      })
      Object.defineProperty(result, "details", {
        value: details,
        enumerable: false,
      })

      return result
    })
  },

  /**
   * Check if a string contains potential secrets (without modifying).
   */
  containsSecrets: (text: string): Effect.Effect<boolean, never> => {
    return Effect.sync(() => {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(text)) return true
      }
      for (const pattern of PII_PATTERNS) {
        if (pattern.test(text)) return true
      }
      return false
    })
  },

  /**
   * Validate that a dataset passes all security checks before training.
   */
  validateDataset: <T extends { context: string }>(
    dataset: ReadonlyArray<T>,
  ): Effect.Effect<{ passed: boolean; issues: ReadonlyArray<string> }, never> => {
    return Effect.sync(() => {
      const issues: string[] = []

      for (let i = 0; i < dataset.length; i++) {
        const sample = dataset[i]

        for (const pattern of SECRET_PATTERNS) {
          const matches = sample.context.match(pattern)
          if (matches) {
            issues.push(`Sample ${i}: Contains ${matches.length} potential secret(s)`)
          }
        }

        for (const pattern of PII_PATTERNS) {
          const matches = sample.context.match(pattern)
          if (matches) {
            issues.push(`Sample ${i}: Contains ${matches.length} potential PII match(es)`)
          }
        }
      }

      return { passed: issues.length === 0, issues }
    })
  },
}
