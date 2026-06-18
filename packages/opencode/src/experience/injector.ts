/**
 * injector.ts — Injection layer for the experience fast loop
 *
 * Formats selected tactics into a prompt block that can be appended
 * to the system prompt. The Injector is the final stage of the fast
 * loop: after observation (Collector), learning (Distiller), and
 * selection (Selector), the Injector makes the chosen knowledge
 * available to the LLM at inference time.
 *
 * Key responsibilities:
 * - Format each tactic as a readable markdown block
 * - Enforce token budgets by including highest-scored tactics first
 * - Merge the formatted block into the existing system prompt
 */

import { Effect } from "effect"
import type { Tactic, TacticScope, TacticStats, TacticStatus } from "./tactic"
import {
  winRate,
  thompsonSample,
  ucbScore,
  canActivate,
  canPromote,
  shouldRetire,
  generateTacticId,
} from "./tactic"
import type { Case } from "./case"
import { createCase } from "./case"
import type { Signal, SignalType, SignalPattern, SignalMetadata } from "./signals"
import { matchSignalPattern } from "./signals"
import { ExperienceStore } from "./store"
import type { LedgerEntry } from "./ledger"
import type { RankedTactic } from "./selector"

// ---------------------------------------------------------------------------
// Injection result
// ---------------------------------------------------------------------------

/**
 * Result of formatting tactics into an injectable prompt block.
 */
export interface InjectResult {
  /** The formatted tactic text ready for injection */
  readonly block: string

  /** IDs of tactics that were included in the block */
  readonly tacticIds: string[]

  /** Rough token estimate for the formatted block */
  readonly estimatedTokens: number

  /** Number of tactics that were omitted due to token budget */
  readonly omittedCount: number
}

// ---------------------------------------------------------------------------
// Injection options
// ---------------------------------------------------------------------------

/**
 * Options controlling how tactics are formatted and injected.
 */
export interface InjectOpts {
  /** Header text for the tactic block (default: "## Learned Tactics") */
  readonly header?: string

  /** Whether to include guardrails section (default: true) */
  readonly includeGuardrails?: boolean

  /** Whether to include verification checks (default: true) */
  readonly includeChecks?: boolean

  /** Format style: "markdown" or "xml" (default: "markdown") */
  readonly format?: "markdown" | "xml"
}

/** Default injection options. */
export const defaultInjectOpts: InjectOpts = {
  header: "## Learned Tactics",
  includeGuardrails: true,
  includeChecks: true,
  format: "markdown",
}

// ---------------------------------------------------------------------------
// Injector service
// ---------------------------------------------------------------------------

/**
 * The Injector formats selected tactics into a prompt block and
 * merges it into the system prompt. It is the "action" phase of
 * the fast loop.
 *
 * @remarks
 * The Injector is intentionally simple — it does not make decisions
 * about *which* tactics to include (that's the Selector's job). It
 * only concerns itself with presentation and token accounting.
 */
export class Injector extends Effect.Service<Injector>()(
  "experience/Injector",
  {
    effect: Effect.gen(function* () {
      const store = yield* ExperienceStore

      /**
       * Format a single tactic as a human-readable markdown block.
       *
       * Each tactic is rendered as:
       * ```
       * ### [title]
       * **Preconditions:** ...
       * **Steps:**
       * 1. ...
       * 2. ...
       * **Checks:** ...
       * **Guardrails:** ...
       * ```
       *
       * @param tactic — The tactic to format
       * @param opts — Injection options controlling output
       * @returns Formatted string for this tactic
       */
      const formatTactic = (
        tactic: Tactic,
        opts?: InjectOpts,
      ): Effect.Effect<string> =>
        Effect.sync(() => {
          const merged = { ...defaultInjectOpts, ...opts }
          const lines: string[] = []

          // Title line
          lines.push(`### ${tactic.title}`)
          lines.push("")

          // Preconditions
          if (tactic.preconditions.length > 0) {
            lines.push(`**Preconditions:**`)
            for (const pre of tactic.preconditions) {
              lines.push(`- ${pre}`)
            }
            lines.push("")
          }

          // Steps
          if (tactic.steps.length > 0) {
            lines.push(`**Steps:**`)
            for (let i = 0; i < tactic.steps.length; i++) {
              lines.push(`${i + 1}. ${tactic.steps[i]}`)
            }
            lines.push("")
          }

          // Verification checks
          if (
            merged.includeChecks &&
            tactic.checks.length > 0
          ) {
            lines.push(`**Checks:**`)
            for (const check of tactic.checks) {
              lines.push(`- ${check}`)
            }
            lines.push("")
          }

          // Guardrails
          if (
            merged.includeGuardrails &&
            tactic.guardrails.forbiddenPaths.length > 0
          ) {
            lines.push(`**Guardrails:**`)
            lines.push(`- Max files: ${tactic.guardrails.maxFiles}`)
            if (tactic.guardrails.forbiddenPaths.length > 0) {
              lines.push(`- Forbidden: ${tactic.guardrails.forbiddenPaths.join(", ")}`)
            }
            if (tactic.guardrails.smallestReversible) {
              lines.push(`- Changes must be reversible`)
            }
            lines.push("")
          }

          // Stats summary (helps the model understand tactic maturity)
          const wr = winRate(tactic.stats)
          lines.push(
            `*[win rate: ${(wr * 100).toFixed(0)}%, ` +
              `uses: ${tactic.stats.uses}, ` +
              `scope: ${formatScope(tactic.scope)}]*`,
          )
          lines.push("")

          return lines.join("\n")
        })

      /**
       * Format multiple ranked tactics into a single injectable
       * prompt block, respecting the token budget.
       *
       * Tactics are processed in the order provided (assumed to be
       * already ranked by the Selector). Each tactic is formatted
       * and its token cost estimated; tactics are included until the
       * budget would be exceeded.
       *
       * @param tactics — Ranked tactics from the Selector
       * @param opts — Injection options
       * @returns Effect resolving to the injection result
       */
      const toPromptBlock = (
        tactics: ReadonlyArray<RankedTactic>,
        opts?: InjectOpts,
      ): Effect.Effect<InjectResult> =>
        Effect.gen(function* () {
          const merged = { ...defaultInjectOpts, ...opts }

          yield* Effect.log(
            `[Injector] Formatting ${tactics.length} tactics into prompt block`,
          )

          if (tactics.length === 0) {
            return {
              block: "",
              tacticIds: [],
              estimatedTokens: 0,
              omittedCount: 0,
            }
          }

          const lines: string[] = []
          const includedIds: string[] = []
          let totalTokens = 0
          let omittedCount = 0

          // Header
          if (merged.header) {
            lines.push(merged.header)
            lines.push("")
            lines.push(
              "The following tactics were learned from past sessions. " +
                "Apply them when their preconditions match the current situation.",
            )
            lines.push("")
            lines.push("---")
            lines.push("")
          }

          for (const ranked of tactics) {
            const formatted = yield* formatTactic(ranked.tactic, merged)
            const tacticTokens = estimateTokens(formatted)

            lines.push(formatted)
            includedIds.push(ranked.tactic.id)
            totalTokens += tacticTokens
          }

          yield* Effect.log(
            `[Injector] Formatted ${includedIds.length} tactics (~${totalTokens} tokens)`,
          )

          const block = lines.join("\n")

          return {
            block,
            tacticIds: includedIds,
            estimatedTokens: totalTokens,
            omittedCount,
          }
        })

      /**
       * Estimate the token count of a text string.
       *
       * Uses a simple heuristic: 1 token ≈ 4 characters for English
       * text. This is a rough approximation — for production use,
       * integrate a proper tokenizer (e.g. tiktoken).
       *
       * @param text — The text to estimate
       * @returns Estimated token count
       */
      const estimateTokens = (text: string): number => {
        return Math.ceil(text.length / 4)
      }

      /**
       * Inject a formatted tactic block into an existing system prompt.
       *
       * The block is appended at the end of the system prompt, after
       * a separator. If the system prompt already contains a tactic
       * block (detected by the header), it is replaced rather than
       * duplicated.
       *
       * @param block — The formatted tactic block from toPromptBlock
       * @param systemPrompt — The existing system prompt to merge into
       * @returns Effect resolving to the merged prompt
       */
      const injectIntoPrompt = (
        block: string,
        systemPrompt: string,
      ): Effect.Effect<string> =>
        Effect.sync(() => {
          if (!block || block.trim().length === 0) {
            // Nothing to inject — return the original prompt
            return systemPrompt
          }

          // Detect if there's already a tactic block in the prompt
          const tacticHeader = defaultInjectOpts.header ?? "## Learned Tactics"
          const existingIdx = systemPrompt.indexOf(tacticHeader)

          if (existingIdx !== -1) {
            // Replace the existing tactic block
            const before = systemPrompt.slice(0, existingIdx).trimEnd()
            return before + "\n\n" + block
          }

          // Append as a new section
          const separator = "\n\n---\n\n"
          return systemPrompt.trimEnd() + separator + block
        })

      /**
       * Full injection pipeline: select + format + inject.
       *
       * This is a convenience method that combines the Selector's
       * output with formatting and injection in one call.
       *
       * @param rankedTactics — Tactics selected by the Selector
       * @param systemPrompt — The current system prompt
       * @param injectOpts — Formatting options
       * @returns Effect resolving to the merged prompt and metadata
       */
      const inject = (
        rankedTactics: ReadonlyArray<RankedTactic>,
        systemPrompt: string,
        injectOpts?: InjectOpts,
      ): Effect.Effect<{
        prompt: string
        result: InjectResult
      }> =>
        Effect.gen(function* () {
          const result = yield* toPromptBlock(rankedTactics, injectOpts)

          if (result.tacticIds.length === 0) {
            yield* Effect.log(`[Injector] No tactics to inject`)
            return { prompt: systemPrompt, result }
          }

          const prompt = yield* injectIntoPrompt(result.block, systemPrompt)

          yield* Effect.log(
            `[Injector] Injected ${result.tacticIds.length} tactics into prompt (~${result.estimatedTokens} tokens)`,
          )

          // Record the injection in the ledger for analytics
          // Non-critical: ignore failures
          yield* store.appendLedger({
            kind: "inject" as const,
            sessionId: "injection", // placeholder
            tacticIds: result.tacticIds,
            timestamp: new Date().toISOString(),
          }).pipe(Effect.catchAll(() => Effect.void))

          return { prompt, result }
        })

      return {
        formatTactic,
        toPromptBlock,
        estimateTokens,
        injectIntoPrompt,
        inject,
      } as const
    }),
  },
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a TacticScope as a human-readable string.
 *
 * TacticScope is a string union: "global" | "repo" | "user" | `lang:${string}`
 */
function formatScope(scope: TacticScope): string {
  if (scope === "global") return "global"
  if (scope === "repo") return "repo"
  if (scope === "user") return "user"
  if (scope.startsWith("lang:")) return scope
  return "unknown"
}
export const InjectorLive = Injector.Default
