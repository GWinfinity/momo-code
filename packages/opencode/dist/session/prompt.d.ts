/**
 * Prompt routing system for momo Code.
 * Routes model requests to the appropriate system prompt file.
 * Supports momo-coder-* model series with momo.txt prompt.
 * Inherits Claude Code prompts when the inheritance switch is enabled.
 */
import { Effect } from "effect";
/** Name of the momo-specific system prompt file. */
export declare const MOMO_PROMPT_FILE = "momo.txt";
/** Name of the default system prompt file. */
export declare const DEFAULT_PROMPT_FILE = "default.txt";
/** Name of the Anthropic-specific system prompt file. */
export declare const ANTHROPIC_PROMPT_FILE = "anthropic.txt";
/** Name of the GPT-specific system prompt file. */
export declare const GPT_PROMPT_FILE = "gpt.txt";
/** Name of the Google-specific system prompt file. */
export declare const GOOGLE_PROMPT_FILE = "google.txt";
/** Name of the Claude Code system prompt file. */
export declare const CLAUDE_PROMPT_FILE = "claude.txt";
/** Name of the OpenRouter-specific system prompt file. */
export declare const OPENROUTER_PROMPT_FILE = "openrouter.txt";
/** Name of the local prompts directory. */
export declare const LOCAL_PROMPTS_DIR = ".momo/prompts";
/** Name of the Claude Code prompts directory. */
export declare const CLAUDE_PROMPTS_DIR = ".claude/prompts";
/**
 * Prompt file selection rules based on model ID.
 */
export interface PromptSelectionRule {
    readonly match: (modelId: string) => boolean;
    readonly promptFile: string;
    readonly description: string;
}
/** Default prompt selection rules in priority order. */
export declare const PROMPT_RULES: readonly PromptSelectionRule[];
/**
 * Resolve the prompt file name for a given model ID.
 */
export declare function resolvePromptFile(modelId: string): string;
/**
 * Search paths for prompt files.
 */
export declare function getPromptSearchPaths(): string[];
/**
 * Find a prompt file in the search paths.
 */
export declare function findPromptFile(filename: string): string | null;
/**
 * Load the system prompt for a given model.
 * Searches through all prompt directories and applies inheritance rules.
 */
export declare function loadSystemPrompt(modelId: string): Effect.Effect<string, Error>;
/**
 * Get the built-in minimal system prompt.
 */
export declare function getMinimalSystemPrompt(): string;
/**
 * Load the momo-specific system prompt (for momo-coder-* models).
 */
export declare function loadMomoSystemPrompt(): Effect.Effect<string, Error>;
/**
 * Get the default momo prompt when no file is found.
 */
export declare function getMomoDefaultPrompt(): string;
/**
 * Check if Claude Code prompt inheritance is active.
 */
export declare function isClaudeCodeInheritanceEnabled(): boolean;
/**
 * List all available prompt files across search paths.
 */
export declare function listAvailablePrompts(): Effect.Effect<Array<{
    name: string;
    path: string;
    source: string;
}>, string[]>;
//# sourceMappingURL=prompt.d.ts.map