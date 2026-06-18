/**
 * Instance state management for momo Code.
 * Tracks per-instance mutable state including the current model selection,
 * allowing hot-swapping of models during a session.
 */

import { Effect, Ref } from "effect"
import type { LanguageModelV3 } from "@ai-sdk/provider"

/**
 * Per-instance state that can be mutated during a session.
 */
export interface InstanceStateShape {
  /** The currently active language model. */
  readonly currentModel: LanguageModelV3 | null

  /** The resolved model ID (after tier expansion). */
  readonly resolvedModelId: string | null

  /** The provider name currently in use. */
  readonly currentProvider: string | null

  /** Whether the instance is using a tier-based model selection. */
  readonly isTierSelection: boolean

  /** Timestamp of the last model swap. */
  readonly lastModelSwapAt: number | null

  /** Claude Code ecosystem configuration inheritance state. */
  readonly claudeCodeInheritance: {
    /** Whether .claude/ config directory is being used. */
    readonly enabled: boolean
    /** Path to the .claude/ directory. */
    readonly configPath: string | null
    /** Whether settings.json was inherited. */
    readonly settingsInherited: boolean
    /** Whether prompts/ directory was inherited. */
    readonly promptsInherited: boolean
  }
}

/** Default initial state for a fresh instance. */
export const defaultInstanceState: InstanceStateShape = {
  currentModel: null,
  resolvedModelId: null,
  currentProvider: null,
  isTierSelection: false,
  lastModelSwapAt: null,
  claudeCodeInheritance: {
    enabled: true,
    configPath: null,
    settingsInherited: false,
    promptsInherited: false,
  },
}

/**
 * InstanceState service provides a mutable reference for per-instance data.
 * Each coding agent instance gets its own state container.
 */
export class InstanceState extends Effect.Service<InstanceState>()(
  "InstanceState",
  {
    effect: Effect.gen(function* () {
      const stateRef = yield* Ref.make<InstanceStateShape>(defaultInstanceState)

      /** Get a snapshot of the current state. */
      const get = Effect.gen(function* () {
        return yield* Ref.get(stateRef)
      })

      /** Update the state with a partial patch. */
      const update = (patch: Partial<InstanceStateShape>) =>
        Ref.update(stateRef, (current) => ({
          ...current,
          ...patch,
          claudeCodeInheritance: {
            ...current.claudeCodeInheritance,
            ...(patch.claudeCodeInheritance || {}),
          },
        }))

      /** Set the current model and provider. */
      const setModel = (
        model: LanguageModelV3,
        modelId: string,
        provider: string,
        isTier = false,
      ) =>
        update({
          currentModel: model,
          resolvedModelId: modelId,
          currentProvider: provider,
          isTierSelection: isTier,
          lastModelSwapAt: Date.now(),
        })

      /** Set Claude Code inheritance state. */
      const setClaudeCodeInheritance = (
        enabled: boolean,
        configPath: string | null,
        settingsInherited: boolean,
        promptsInherited: boolean,
      ) =>
        update({
          claudeCodeInheritance: {
            enabled,
            configPath,
            settingsInherited,
            promptsInherited,
          },
        })

      /** Reset state to defaults. */
      const reset = Ref.set(stateRef, defaultInstanceState)

      return { get, update, setModel, setClaudeCodeInheritance, reset }
    }),
  },
) {}
