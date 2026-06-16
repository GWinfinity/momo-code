/**
 * Monte Carlo Graph Search (MCGS) — Core search algorithm.
 *
 * Implements the four MCGS operators:
 * - EXPAND: Hypothesis-driven modification of D/H/S
 * - SCORE: Real training + evaluation (no surrogate)
 * - FUSE: Cross-branch fusion for exploration
 * - PRUNE: Remove low-utility branches
 *
 * Reference: Pioneer Agent §2.4 — "MCGS treats training pipeline
 * search as a graph problem with four operators."
 */
import { Effect } from "effect";
import type { MCGraph, MCNode, EvalScore, TrainingPipeline, Taxonomy, TrainingJob } from "./index";
export interface SearchOpts {
    readonly explorationConstant: number;
    readonly decayFactor: number;
    readonly maxDepth: number;
    readonly stagnationThreshold: number;
}
declare const Search_base: Effect.Service.Class<Search, "evolve/Search", {
    readonly effect: Effect.Effect<{
        readonly init: (opts: {
            root: string;
        }) => Effect.Effect<MCGraph, never, never>;
        readonly selectUCT: (graph: MCGraph) => Effect.Effect<MCNode, never, never>;
        readonly expand: (parent: MCNode, taxonomy: Taxonomy) => Effect.Effect<MCNode[], never, never>;
        readonly addNode: (graph: MCGraph, opts: {
            pi: TrainingPipeline;
            f: EvalScore;
            job: TrainingJob;
            parentId: string;
        }) => Effect.Effect<void, never, never>;
        readonly best: (graph: MCGraph) => Effect.Effect<MCNode, never, never>;
        readonly shouldContinue: (graph: MCGraph, budget: number, maxIters: number) => Effect.Effect<boolean, never, never>;
        readonly stagnated: (graph: MCGraph, threshold: number) => Effect.Effect<boolean, never, never>;
        readonly fuseOrEvolve: (graph: MCGraph) => Effect.Effect<void, never, never>;
        readonly prune: (graph: MCGraph, threshold: number) => Effect.Effect<void, never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Search service — implements Monte Carlo Graph Search.
 *
 * The graph represents the search space of training pipelines π=(D,H,S).
 * Each node is a pipeline configuration; edges represent modifications.
 *
 * MCGS operators:
 * - SELECT: UCT-based node selection with time-decayed exploration
 * - EXPAND: Generate child nodes by modifying D, H, or S
 * - SCORE: Evaluate a node (handled by trainer/evaluator)
 * - FUSE: Cross-branch fusion for exploration beyond local optima
 * - PRUNE: Remove low-utility subtrees
 */
export declare class Search extends Search_base {
}
export declare const SearchLive: import("effect/Layer").Layer<Search, never, never>;
export {};
//# sourceMappingURL=search.d.ts.map