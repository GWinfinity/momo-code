/**
 * Provenance Ledger — data-curation.md style logging.
 *
 * Records for each promotion:
 * - Dataset version, slice ratios, quality controls applied
 * - Confusion clusters used, number of samples per cluster
 * - Hyperparameters and learning strategy
 * - Eval scores, regression counts
 * - Approval metadata (who, when)
 *
 * Survives context compression — the audit trail of self-evolution.
 *
 * Reference: Pioneer Agent §2.8 — "Provenance tracking ensures every
 * training decision is auditable and reproducible."
 */
import { Effect } from "effect";
import type { MCGraph, MCNode, EvalScore } from "./index";
export interface ProvenanceEntry {
    readonly timestamp: Date;
    readonly modelId: string;
    readonly action: "staged" | "promoted" | "rejected" | "rolled_back";
    readonly datasetVersion: string;
    readonly goldCount: number;
    readonly hardNegCount: number;
    readonly replayCount: number;
    readonly clusters: ReadonlyArray<string>;
    readonly hyperparams: {
        readonly baseModel: string;
        readonly loraRank: number;
        readonly learningRate: number;
        readonly epochs: number;
        readonly batchSize: number;
        readonly format: string;
    };
    readonly evalScore: EvalScore;
    readonly approvedBy?: string;
    readonly notes: string;
    readonly iteration: number;
    readonly depth: number;
}
declare const Provenance_base: Effect.Service.Class<Provenance, "evolve/Provenance", {
    readonly effect: Effect.Effect<{
        readonly append: (graph: MCGraph, node: MCNode, action: ProvenanceEntry["action"]) => Effect.Effect<void, never, never>;
        readonly list: () => Effect.Effect<readonly ProvenanceEntry[], never, never>;
        readonly generateReport: () => Effect.Effect<string, never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Provenance service — maintains the audit trail of all training decisions.
 *
 * Each entry records the full state of a training iteration:
 * what data was used, what hyperparameters were set, what the
 * outcome was, and who approved it.
 */
export declare class Provenance extends Provenance_base {
}
export declare const ProvenanceLive: import("effect/Layer").Layer<Provenance, never, never>;
export {};
//# sourceMappingURL=provenance.d.ts.map