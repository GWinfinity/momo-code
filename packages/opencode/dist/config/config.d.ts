/**
 * Configuration system for momo Code.
 * Manages loading and merging of configuration from files, environment variables,
 * and CLI arguments. Replaces .opencode/ with .momo/ paths.
 */
import { Effect, Layer } from "effect";
/** Configuration directory name for momo Code. */
export declare const CONFIG_DIR_NAME = ".momo";
/** Configuration file name. */
export declare const CONFIG_FILE_NAME = "momo.jsonc";
/** Session subdirectory name. */
export declare const SESSION_DIR_NAME = "sessions";
/** Claude Code config directory name. */
export declare const CLAUDE_CODE_DIR_NAME = ".claude";
/**
 * Get the default configuration directory path.
 * Uses MOMO_CONFIG_DIR if set, otherwise ~/.momo/
 */
export declare function getConfigDir(): string;
/**
 * Get the path to the main configuration file.
 */
export declare function getConfigFilePath(): string;
/**
 * Get the sessions directory path.
 */
export declare function getSessionsDir(): string;
/**
 * Get the Claude Code configuration directory path (for inheritance).
 */
export declare function getClaudeCodeDir(): string;
/**
 * User configuration shape for momo Code.
 */
export interface UserConfig {
    /** Default model ID or tier to use. */
    readonly model?: string;
    /** Default provider to use. */
    readonly provider?: string;
    /** API key (prefer MOMO_API_KEY env var). */
    readonly apiKey?: string;
    /** Base URL override for the provider. */
    readonly baseUrl?: string;
    /** Whether to inherit Claude Code configuration. */
    readonly inheritClaudeCode?: boolean;
    /** Whether to inherit Claude Code prompts. */
    readonly inheritClaudePrompts?: boolean;
    /** Whether to inherit Claude Code settings. */
    readonly inheritClaudeSettings?: boolean;
    /** Theme setting. */
    readonly theme?: "dark" | "light" | "system";
    /** Analytics enabled. */
    readonly analytics?: boolean;
    /** Default tier preference. */
    readonly tier?: "ultra" | "standard" | "lite";
    /** Provider-specific overrides. */
    readonly providers?: Record<string, {
        readonly apiKey?: string;
        readonly baseUrl?: string;
        readonly defaultModel?: string;
        readonly headers?: Record<string, string>;
    }>;
    /** Custom model aliases. */
    readonly modelAliases?: Record<string, string>;
    /** Editor preference. */
    readonly editor?: string;
    /** Shell preference. */
    readonly shell?: string;
    /** Enable experimental features. */
    readonly experimental?: Record<string, boolean>;
}
/**
 * Load the user configuration from the config file.
 * Returns default config if the file does not exist.
 */
export declare function loadUserConfig(): Effect.Effect<UserConfig, Error>;
/**
 * Ensure the configuration directory exists.
 */
export declare function ensureConfigDir(): Effect.Effect<void, Error>;
declare const Config_base: Effect.Service.Class<Config, "Config", {
    readonly effect: Effect.Effect<{
        get: <T>(key: keyof UserConfig, fallback: T) => Effect.Effect<T>;
        getOptional: <T>(key: keyof UserConfig) => Effect.Effect<T | undefined>;
        getProviderConfig: (providerName: string) => Effect.Effect<NonNullable<UserConfig["providers"]>[string] | undefined>;
        getRaw: Effect.Effect<UserConfig, never, never>;
        userConfig: UserConfig;
    }, Error, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Configuration service for momo Code.
 * Provides typed access to merged configuration values.
 */
export declare class Config extends Config_base {
}
/** Default live layer for the Config service. */
export declare const ConfigLive: Layer.Layer<Config, Error, never>;
export {};
//# sourceMappingURL=config.d.ts.map