/**
 * Prompt routing system for momo Code.
 * Routes model requests to the appropriate system prompt file.
 * Supports momo-coder-* model series with momo.txt prompt.
 * Inherits Claude Code prompts when the inheritance switch is enabled.
 */

import { Effect } from "effect"
import fs from "fs"
import path from "path"
import os from "os"

/** Name of the momo-specific system prompt file. */
export const MOMO_PROMPT_FILE = "momo.txt"

/** Name of the default system prompt file. */
export const DEFAULT_PROMPT_FILE = "default.txt"

/** Name of the Anthropic-specific system prompt file. */
export const ANTHROPIC_PROMPT_FILE = "anthropic.txt"

/** Name of the GPT-specific system prompt file. */
export const GPT_PROMPT_FILE = "gpt.txt"

/** Name of the Google-specific system prompt file. */
export const GOOGLE_PROMPT_FILE = "google.txt"

/** Name of the Claude Code system prompt file. */
export const CLAUDE_PROMPT_FILE = "claude.txt"

/** Name of the OpenRouter-specific system prompt file. */
export const OPENROUTER_PROMPT_FILE = "openrouter.txt"

/** Name of the local prompts directory. */
export const LOCAL_PROMPTS_DIR = ".momo/prompts"

/** Name of the Claude Code prompts directory. */
export const CLAUDE_PROMPTS_DIR = ".claude/prompts"

/**
 * Prompt file selection rules based on model ID.
 */
export interface PromptSelectionRule {
  readonly match: (modelId: string) => boolean
  readonly promptFile: string
  readonly description: string
}

/** Default prompt selection rules in priority order. */
export const PROMPT_RULES: readonly PromptSelectionRule[] = [
  {
    match: (modelId: string) =>
      modelId.startsWith("momo-coder-"),
    promptFile: MOMO_PROMPT_FILE,
    description: "momo Code proprietary model series",
  },
  {
    match: (modelId: string) =>
      modelId.includes("claude") || modelId.includes("sonnet") || modelId.includes("haiku"),
    promptFile: ANTHROPIC_PROMPT_FILE,
    description: "Anthropic Claude models",
  },
  {
    match: (modelId: string) =>
      modelId.includes("gpt-"),
    promptFile: GPT_PROMPT_FILE,
    description: "OpenAI GPT models",
  },
  {
    match: (modelId: string) =>
      modelId.includes("gemini"),
    promptFile: GOOGLE_PROMPT_FILE,
    description: "Google Gemini models",
  },
  {
    match: (_modelId: string) => true,
    promptFile: DEFAULT_PROMPT_FILE,
    description: "Fallback default prompt",
  },
]

/**
 * Resolve the prompt file name for a given model ID.
 */
export function resolvePromptFile(modelId: string): string {
  for (const rule of PROMPT_RULES) {
    if (rule.match(modelId)) {
      return rule.promptFile
    }
  }
  return DEFAULT_PROMPT_FILE
}

/**
 * Search paths for prompt files.
 */
export function getPromptSearchPaths(): string[] {
  const paths: string[] = []

  // 1. Local .momo/prompts/ directory (highest priority)
  paths.push(path.join(process.cwd(), LOCAL_PROMPTS_DIR))

  // 2. Global ~/.momo/prompts/ directory
  paths.push(path.join(os.homedir(), ".momo", "prompts"))

  // 3. Claude Code prompts inheritance (if enabled)
  const claudeCodeInherit = process.env.MOMO_CLAUDE_CODE_INHERIT !== "false"
  const noClaudePrompts = process.env.MOMO_NO_CLAUDE_PROMPTS === "true"
  if (claudeCodeInherit && !noClaudePrompts) {
    paths.push(path.join(os.homedir(), CLAUDE_PROMPTS_DIR))
  }

  // 4. Built-in prompts directory
  paths.push(path.join(__dirname, "..", "..", "prompts"))

  return paths
}

/**
 * Find a prompt file in the search paths.
 */
export function findPromptFile(filename: string): string | null {
  const searchPaths = getPromptSearchPaths()
  for (const dir of searchPaths) {
    const fullPath = path.join(dir, filename)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }
  return null
}

/**
 * Load the system prompt for a given model.
 * Searches through all prompt directories and applies inheritance rules.
 */
export function loadSystemPrompt(modelId: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const promptFile = resolvePromptFile(modelId)
    const searchPaths = getPromptSearchPaths()

    // Try to find the specific prompt file
    for (const dir of searchPaths) {
      const fullPath = path.join(dir, promptFile)
      if (fs.existsSync(fullPath)) {
        const content = yield* Effect.tryPromise({
          try: () => fs.promises.readFile(fullPath, "utf-8"),
          catch: (error) =>
            new Error(
              `Failed to read prompt file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
            ),
        })
        return content
      }
    }

    // Fallback: try default.txt
    for (const dir of searchPaths) {
      const fullPath = path.join(dir, DEFAULT_PROMPT_FILE)
      if (fs.existsSync(fullPath)) {
        const content = yield* Effect.tryPromise({
          try: () => fs.promises.readFile(fullPath, "utf-8"),
          catch: (error) =>
            new Error(
              `Failed to read default prompt file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
            ),
        })
        return content
      }
    }

    // Ultimate fallback: built-in minimal prompt
    return yield* Effect.succeed(getMinimalSystemPrompt())
  })
}

/**
 * Get the built-in minimal system prompt.
 */
export function getMinimalSystemPrompt(): string {
  return [
    "You are momo Code, a helpful coding assistant.",
    "You help users write, debug, and understand code.",
    "You provide concise, accurate responses with code examples when appropriate.",
    "Always use best practices and explain your reasoning.",
  ].join("\n")
}

/**
 * Load the momo-specific system prompt (for momo-coder-* models).
 */
export function loadMomoSystemPrompt(): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const searchPaths = getPromptSearchPaths()

    for (const dir of searchPaths) {
      const fullPath = path.join(dir, MOMO_PROMPT_FILE)
      if (fs.existsSync(fullPath)) {
        const content = yield* Effect.tryPromise({
          try: () => fs.promises.readFile(fullPath, "utf-8"),
          catch: (error) =>
            new Error(
              `Failed to read momo prompt file: ${error instanceof Error ? error.message : String(error)}`,
            ),
        })
        return content
      }
    }

    // Return enhanced minimal prompt for momo models
    return yield* Effect.succeed(getMomoDefaultPrompt())
  })
}

/**
 * Get the default momo prompt when no file is found.
 */
export function getMomoDefaultPrompt(): string {
  return [
    "You are momo Code, an expert coding assistant powered by advanced AI.",
    "",
    "Core capabilities:",
    "- Write clean, maintainable, production-ready code",
    "- Debug complex issues with systematic analysis",
    "- Explain code and concepts clearly with examples",
    "- Refactor and optimize existing code",
    "- Review code for bugs, security, and performance",
    "- Generate tests and documentation",
    "- Navigate large codebases efficiently",
    "",
    "Guidelines:",
    "- Prefer modern language features and idiomatic patterns",
    "- Include type annotations and error handling",
    "- Write self-documenting code with clear naming",
    "- Consider edge cases and performance implications",
    "- Use the simplest solution that meets requirements",
    "- When uncertain, ask clarifying questions",
    "",
    "Always format code responses in markdown code blocks with language tags.",
  ].join("\n")
}

/**
 * Check if Claude Code prompt inheritance is active.
 */
export function isClaudeCodeInheritanceEnabled(): boolean {
  if (process.env.MOMO_CLAUDE_CODE_INHERIT === "false") return false
  if (process.env.MOMO_NO_CLAUDE_PROMPTS === "true") return false
  return true
}

/**
 * List all available prompt files across search paths.
 */
export function listAvailablePrompts(): Effect.Effect<
  Array<{ name: string; path: string; source: string }>,
  string[]
> {
  return Effect.gen(function* () {
    const prompts: Array<{ name: string; path: string; source: string }> = []
    const seen = new Set<string>()
    const searchPaths = getPromptSearchPaths()

    for (const dir of searchPaths) {
      if (!fs.existsSync(dir)) continue
      const files = yield* Effect.tryPromise({
        try: () => fs.promises.readdir(dir),
        catch: () => [] as string[],
      })
      for (const file of files) {
        if (file.endsWith(".txt") && !seen.has(file)) {
          seen.add(file)
          prompts.push({
            name: file,
            path: path.join(dir, file),
            source: dir,
          })
        }
      }
    }

    return prompts
  })
}
