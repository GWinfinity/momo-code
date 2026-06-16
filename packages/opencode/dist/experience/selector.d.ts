/**
 * selector.ts — Selection layer for the experience fast loop
 *
 * Responsible for choosing which tactics to inject into a prompt
 * for a given task. The Selector implements two explore/exploit
 * strategies:
 *
 * - **Thompson sampling** (default) — Sample from a Beta posterior
 *   for each tactic, then rank by the sample. Naturally balances
 *   exploration (uncertain tactics get lucky draws) with exploitation
 *   (high-performing tactics usually win).
 *
 * - **UCB** (alternative) — Upper Confidence Bound ranking for
 *   scenarios where you want deterministic, worst-case-optimal
 *   selection.
 *
 * The Selector also computes scope priority so that narrowly scoped
 * tactics (repo-specific, language-specific) are preferred over
 * broadly scoped ones (global) when relevance is equal.
 */
import { Effect } from "effect";
import type { Tactic, TacticScope } from "./tactic";
import type { Signal } from "./signals";
import { ExperienceStore } from "./store";
/**
 * Configuration for tactic selection.
 */
export interface SelectionOpts {
    /** Maximum number of tactics to select (default: 6) */
    readonly k: number;
    /** Ranking method: Thompson sampling or UCB */
    readonly method: "thompson" | "ucb";
    /** Maximum tokens available for the injected tactic block */
    readonly budgetTokens: number;
    /** Minimum win-rate threshold for a tactic to be considered (0-1) */
    readonly minWinRate?: number;
    /** Apply scope-priority boost (default: true) */
    readonly scopeBoost?: boolean;
}
/** Default selection options. */
export declare const defaultSelectionOpts: SelectionOpts;
/**
 * Describes the current task so the Selector can match tactics
 * against it.
 */
export interface TaskContext {
    /** Signals detected in the current task/session */
    readonly signals: ReadonlyArray<Signal>;
    /** The repository name (for repo-scoped tactic matching) */
    readonly repo?: string;
    /** The programming language (for language-scoped matching) */
    readonly language?: string;
    /** The user identifier (for user-scoped matching) */
    readonly userId?: string;
    /** The primary tools expected to be used */
    readonly expectedTools?: string[];
}
/**
 * A tactic that has been scored and ranked by the selection algorithm.
 */
export interface RankedTactic {
    /** The tactic itself */
    readonly tactic: Tactic;
    /** The raw score from the ranking method (Thompson sample or UCB) */
    readonly rawScore: number;
    /** Scope-priority multiplier applied */
    readonly scopeBoost: number;
    /** Final composite score (rawScore * scopeBoost) */
    readonly finalScore: number;
    /** Whether this tactic matched any task signals */
    readonly signalMatched: boolean;
}
declare const Selector_base: Effect.Service.Class<Selector, "experience/Selector", {
    readonly effect: Effect.Effect<{
        readonly retrieve: (ctx: TaskContext, opts?: Partial<SelectionOpts>) => Effect.Effect<Tactic[]>;
        readonly rankThompson: (candidates: ReadonlyArray<Tactic>, ctx: TaskContext, opts?: Partial<SelectionOpts>) => Effect.Effect<RankedTactic[]>;
        readonly rankUcb: (candidates: ReadonlyArray<Tactic>, ctx: TaskContext, opts?: Partial<SelectionOpts>) => Effect.Effect<RankedTactic[]>;
        readonly scopePriority: (scope: TacticScope, ctx: TaskContext) => number;
        readonly select: (ctx: TaskContext, opts?: Partial<SelectionOpts>) => Effect.Effect<RankedTactic[]>;
    }, never, ExperienceStore>;
}>;
/**
 * The Selector chooses which tactics to inject for a given task.
 * It implements explore/exploit trade-offs via Thompson sampling
 * or UCB, and respects scope specificity and token budgets.
 *
 * @remarks
 * The Selector is the "decision" phase of the fast loop. After
 * the Collector has observed and the Distiller has learned, the
 * Selector decides which knowledge to apply.
 */
export declare class Selector extends Selector_base {
}
export declare const SelectorLive: import("effect/Layer").Layer<Selector, never, ExperienceStore>;
export {};
//# sourceMappingURL=selector.d.ts.map