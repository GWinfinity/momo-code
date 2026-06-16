/**
 * Flag and feature toggle system for momo Code.
 * Provides typed access to runtime feature flags.
 */
import { Effect } from "effect";
/**
 * Static flag access for environment-based toggles.
 */
export declare const Flag: {
    /** Model catalog URL override. */
    readonly MOMO_MODELS_URL: string | undefined;
    /** Debug mode flag. */
    readonly MOMO_DEBUG: boolean;
    /** Analytics disabled flag. */
    readonly MOMO_NO_ANALYTICS: boolean;
    /** Chunk timeout override. */
    readonly MOMO_CHUNK_TIMEOUT: number | undefined;
    /** Default tier preference. */
    readonly MOMO_DEFAULT_TIER: string | undefined;
    /** Claude Code inheritance master switch. */
    readonly MOMO_CLAUDE_CODE_INHERIT: boolean;
    /** Disable Claude Code prompts. */
    readonly MOMO_NO_CLAUDE_PROMPTS: boolean;
    /** Disable Claude Code settings. */
    readonly MOMO_NO_CLAUDE_SETTINGS: boolean;
    /** Enable experimental streaming v2. */
    readonly EXPERIMENTAL_STREAMING_V2: boolean;
    /** Enable provider fallback on failure. */
    readonly PROVIDER_FALLBACK: boolean;
};
declare const Flags_base: Effect.Service.Class<Flags, "Flags", {
    readonly effect: Effect.Effect<{
        isEnabled: (flagName: keyof typeof Flag) => boolean;
        all: {
            /** Model catalog URL override. */
            readonly MOMO_MODELS_URL: string | undefined;
            /** Debug mode flag. */
            readonly MOMO_DEBUG: boolean;
            /** Analytics disabled flag. */
            readonly MOMO_NO_ANALYTICS: boolean;
            /** Chunk timeout override. */
            readonly MOMO_CHUNK_TIMEOUT: number | undefined;
            /** Default tier preference. */
            readonly MOMO_DEFAULT_TIER: string | undefined;
            /** Claude Code inheritance master switch. */
            readonly MOMO_CLAUDE_CODE_INHERIT: boolean;
            /** Disable Claude Code prompts. */
            readonly MOMO_NO_CLAUDE_PROMPTS: boolean;
            /** Disable Claude Code settings. */
            readonly MOMO_NO_CLAUDE_SETTINGS: boolean;
            /** Enable experimental streaming v2. */
            readonly EXPERIMENTAL_STREAMING_V2: boolean;
            /** Enable provider fallback on failure. */
            readonly PROVIDER_FALLBACK: boolean;
        };
    }, never, never>;
}>;
/**
 * Feature flags service for dynamic flag evaluation.
 */
export declare class Flags extends Flags_base {
}
export declare const FlagsLive: import("effect/Layer").Layer<Flags, never, never>;
export {};
//# sourceMappingURL=flag.d.ts.map