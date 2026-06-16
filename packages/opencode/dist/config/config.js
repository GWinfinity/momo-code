/**
 * Configuration system for momo Code.
 * Manages loading and merging of configuration from files, environment variables,
 * and CLI arguments. Replaces .opencode/ with .momo/ paths.
 */
import { Effect } from "effect";
import os from "os";
import path from "path";
import fs from "fs";
/** Configuration directory name for momo Code. */
export const CONFIG_DIR_NAME = ".momo";
/** Configuration file name. */
export const CONFIG_FILE_NAME = "momo.jsonc";
/** Session subdirectory name. */
export const SESSION_DIR_NAME = "sessions";
/** Claude Code config directory name. */
export const CLAUDE_CODE_DIR_NAME = ".claude";
/**
 * Get the default configuration directory path.
 * Uses MOMO_CONFIG_DIR if set, otherwise ~/.momo/
 */
export function getConfigDir() {
    return process.env.MOMO_CONFIG_DIR || path.join(os.homedir(), CONFIG_DIR_NAME);
}
/**
 * Get the path to the main configuration file.
 */
export function getConfigFilePath() {
    return path.join(getConfigDir(), CONFIG_FILE_NAME);
}
/**
 * Get the sessions directory path.
 */
export function getSessionsDir() {
    return path.join(getConfigDir(), SESSION_DIR_NAME);
}
/**
 * Get the Claude Code configuration directory path (for inheritance).
 */
export function getClaudeCodeDir() {
    return path.join(os.homedir(), CLAUDE_CODE_DIR_NAME);
}
/**
 * Load the user configuration from the config file.
 * Returns default config if the file does not exist.
 */
export function loadUserConfig() {
    return Effect.gen(function* () {
        const configPath = getConfigFilePath();
        const exists = yield* Effect.sync(() => fs.existsSync(configPath));
        if (!exists) {
            return {};
        }
        const content = yield* Effect.tryPromise({
            try: () => fs.promises.readFile(configPath, "utf-8"),
            catch: (error) => new Error(`Failed to read config file: ${error instanceof Error ? error.message : String(error)}`),
        });
        // Strip JSONC comments before parsing
        const stripped = content
            .replace(/\/\/.*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
        try {
            const parsed = JSON.parse(stripped);
            return parsed;
        }
        catch {
            return {};
        }
    });
}
/**
 * Ensure the configuration directory exists.
 */
export function ensureConfigDir() {
    return Effect.tryPromise({
        try: () => fs.promises.mkdir(getConfigDir(), { recursive: true }),
        catch: (error) => new Error(`Failed to create config directory: ${error instanceof Error ? error.message : String(error)}`),
    });
}
/**
 * Configuration service for momo Code.
 * Provides typed access to merged configuration values.
 */
export class Config extends Effect.Service()("Config", {
    effect: Effect.gen(function* () {
        const userConfig = yield* loadUserConfig();
        /** Get a config value with fallback. */
        const get = (key, fallback) => {
            return Effect.sync(() => {
                const value = userConfig[key];
                return value !== undefined ? value : fallback;
            });
        };
        /** Get an optional config value. */
        const getOptional = (key) => {
            return Effect.sync(() => userConfig[key]);
        };
        /** Get provider-specific configuration. */
        const getProviderConfig = (providerName) => {
            return Effect.sync(() => userConfig.providers?.[providerName]);
        };
        /** Get the raw user config object. */
        const getRaw = Effect.sync(() => userConfig);
        return {
            get,
            getOptional,
            getProviderConfig,
            getRaw,
            userConfig,
        };
    }),
    dependencies: [],
}) {
}
/** Default live layer for the Config service. */
export const ConfigLive = Config.Default;
//# sourceMappingURL=config.js.map