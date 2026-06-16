/**
 * Instance state management for momo Code.
 * Tracks per-instance mutable state including the current model selection,
 * allowing hot-swapping of models during a session.
 */
import { Effect } from "effect";
import type { LanguageModelV3 } from "@ai-sdk/provider";
/**
 * Per-instance state that can be mutated during a session.
 */
export interface InstanceStateShape {
    /** The currently active language model. */
    readonly currentModel: LanguageModelV3 | null;
    /** The resolved model ID (after tier expansion). */
    readonly resolvedModelId: string | null;
    /** The provider name currently in use. */
    readonly currentProvider: string | null;
    /** Whether the instance is using a tier-based model selection. */
    readonly isTierSelection: boolean;
    /** Timestamp of the last model swap. */
    readonly lastModelSwapAt: number | null;
    /** Claude Code ecosystem configuration inheritance state. */
    readonly claudeCodeInheritance: {
        /** Whether .claude/ config directory is being used. */
        readonly enabled: boolean;
        /** Path to the .claude/ directory. */
        readonly configPath: string | null;
        /** Whether settings.json was inherited. */
        readonly settingsInherited: boolean;
        /** Whether prompts/ directory was inherited. */
        readonly promptsInherited: boolean;
    };
}
/** Default initial state for a fresh instance. */
export declare const defaultInstanceState: InstanceStateShape;
declare const InstanceState_base: Effect.Service.Class<InstanceState, "InstanceState", {
    readonly effect: Effect.Effect<{
        get: Effect.Effect<InstanceStateShape, never, never>;
        update: (patch: Partial<InstanceStateShape>) => Effect.Effect<void, never, never>;
        setModel: (model: LanguageModelV3, modelId: string, provider: string, isTier?: boolean) => Effect.Effect<void, never, never>;
        setClaudeCodeInheritance: (enabled: boolean, configPath: string | null, settingsInherited: boolean, promptsInherited: boolean) => Effect.Effect<void, never, never>;
        reset: Effect.Effect<void, never, never>;
    }, never, never>;
}>;
/**
 * InstanceState service provides a mutable reference for per-instance data.
 * Each coding agent instance gets its own state container.
 */
export declare class InstanceState extends InstanceState_base {
}
export {};
//# sourceMappingURL=instance-state.d.ts.map