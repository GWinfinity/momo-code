/**
 * Flag and feature toggle system for momo Code.
 * Provides typed access to runtime feature flags.
 */

import { Effect } from "effect"

/**
 * Static flag access for environment-based toggles.
 */
export const Flag = {
  /** Model catalog URL override. */
  get MOMO_MODELS_URL(): string | undefined {
    return process.env.MOMO_MODELS_URL
  },

  /** Debug mode flag. */
  get MOMO_DEBUG(): boolean {
    return process.env.MOMO_DEBUG === "1" || process.env.MOMO_DEBUG === "true"
  },

  /** Analytics disabled flag. */
  get MOMO_NO_ANALYTICS(): boolean {
    return process.env.MOMO_NO_ANALYTICS === "1" || process.env.MOMO_NO_ANALYTICS === "true"
  },

  /** Chunk timeout override. */
  get MOMO_CHUNK_TIMEOUT(): number | undefined {
    const val = process.env.MOMO_CHUNK_TIMEOUT
    if (!val) return undefined
    const parsed = Number(val)
    return Number.isNaN(parsed) ? undefined : parsed
  },

  /** Default tier preference. */
  get MOMO_DEFAULT_TIER(): string | undefined {
    return process.env.MOMO_DEFAULT_TIER
  },

  /** Claude Code inheritance master switch. */
  get MOMO_CLAUDE_CODE_INHERIT(): boolean {
    return process.env.MOMO_CLAUDE_CODE_INHERIT !== "false"
  },

  /** Disable Claude Code prompts. */
  get MOMO_NO_CLAUDE_PROMPTS(): boolean {
    return process.env.MOMO_NO_CLAUDE_PROMPTS === "true"
  },

  /** Disable Claude Code settings. */
  get MOMO_NO_CLAUDE_SETTINGS(): boolean {
    return process.env.MOMO_NO_CLAUDE_SETTINGS === "true"
  },

  /** Enable experimental streaming v2. */
  get EXPERIMENTAL_STREAMING_V2(): boolean {
    return process.env.MOMO_EXPERIMENTAL_STREAMING_V2 === "true"
  },

  /** Enable provider fallback on failure. */
  get PROVIDER_FALLBACK(): boolean {
    return process.env.MOMO_PROVIDER_FALLBACK !== "false"
  },
} as const

/**
 * Feature flags service for dynamic flag evaluation.
 */
export class Flags extends Effect.Service<Flags>()("Flags", {
  effect: Effect.gen(function* () {
    const isEnabled = (flagName: keyof typeof Flag): boolean => {
      return !!(Flag[flagName] as unknown)
    }

    return {
      isEnabled,
      all: Flag,
    }
  }),
}) {}

export const FlagsLive = Flags.Default
