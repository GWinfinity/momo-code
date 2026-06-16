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
import { Effect } from "effect";
import type { Tactic } from "./tactic";
import { ExperienceStore } from "./store";
import type { RankedTactic } from "./selector";
/**
 * Result of formatting tactics into an injectable prompt block.
 */
export interface InjectResult {
    /** The formatted tactic text ready for injection */
    readonly block: string;
    /** IDs of tactics that were included in the block */
    readonly tacticIds: string[];
    /** Rough token estimate for the formatted block */
    readonly estimatedTokens: number;
    /** Number of tactics that were omitted due to token budget */
    readonly omittedCount: number;
}
/**
 * Options controlling how tactics are formatted and injected.
 */
export interface InjectOpts {
    /** Header text for the tactic block (default: "## Learned Tactics") */
    readonly header?: string;
    /** Whether to include guardrails section (default: true) */
    readonly includeGuardrails?: boolean;
    /** Whether to include verification checks (default: true) */
    readonly includeChecks?: boolean;
    /** Format style: "markdown" or "xml" (default: "markdown") */
    readonly format?: "markdown" | "xml";
}
/** Default injection options. */
export declare const defaultInjectOpts: InjectOpts;
declare const Injector_base: Effect.Service.Class<Injector, "experience/Injector", {
    readonly effect: Effect.Effect<{
        readonly formatTactic: (tactic: Tactic, opts?: InjectOpts) => Effect.Effect<string>;
        readonly toPromptBlock: (tactics: ReadonlyArray<RankedTactic>, opts?: InjectOpts) => Effect.Effect<InjectResult>;
        readonly estimateTokens: (text: string) => number;
        readonly injectIntoPrompt: (block: string, systemPrompt: string) => Effect.Effect<string>;
        readonly inject: (rankedTactics: ReadonlyArray<RankedTactic>, systemPrompt: string, injectOpts?: InjectOpts) => Effect.Effect<{
            prompt: string;
            result: InjectResult;
        }>;
    }, never, ExperienceStore>;
}>;
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
export declare class Injector extends Injector_base {
}
export declare const InjectorLive: import("effect/Layer").Layer<Injector, never, ExperienceStore>;
export {};
//# sourceMappingURL=injector.d.ts.map