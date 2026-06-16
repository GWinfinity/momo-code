/**
 * Store — Training job state, datasets, checkpoint metadata, MCGS graph persistence.
 *
 * Handles persistence of:
 * - Training jobs (status, checkpoints, results)
 * - MCGS graph state (nodes, scores, parent-child relationships)
 * - Session data for mining signals
 * - Evaluation history
 *
 * Reference: Pioneer Agent §2.7 — "Job state is persisted to survive
 * preemption and enable resume."
 */
import { Effect, Option } from "effect";
import type { TrainingJob, MCGraph, TrainingSample } from "./index";
export interface SessionRecord {
    readonly id: string;
    readonly messages: ReadonlyArray<{
        readonly role: "user" | "assistant" | "system";
        readonly content: string;
        readonly timestamp: number;
    }>;
    readonly tools: ReadonlyArray<{
        readonly tool: string;
        readonly input: unknown;
        readonly output: unknown;
        readonly accepted: boolean;
        readonly exitCode?: number;
        readonly retries: number;
    }>;
    readonly createdAt: number;
}
export interface StoreOpts {
    readonly dbPath?: string;
}
declare const Store_base: Effect.Service.Class<Store, "evolve/Store", {
    readonly effect: Effect.Effect<{
        readonly recentSessions: (opts: {
            days: number;
            limit: number;
        }) => Effect.Effect<SessionRecord[], never, never>;
        readonly insertSessions: (sessions: ReadonlyArray<SessionRecord>) => Effect.Effect<void, never, never>;
        readonly currentJob: () => Effect.Effect<TrainingJob | undefined, never, never>;
        readonly saveJob: (job: TrainingJob) => Effect.Effect<void, never, never>;
        readonly updateJob: (jobId: string, update: Partial<Pick<TrainingJob, "status" | "completedAt" | "checkpointUrl">>) => Effect.Effect<void, never, never>;
        readonly allJobs: () => Effect.Effect<readonly TrainingJob[], never, never>;
        readonly saveGraph: (graph: MCGraph) => Effect.Effect<void, never, never>;
        readonly loadGraph: () => Effect.Effect<Option.Option<MCGraph>, never, never>;
        readonly saveCheckpoint: (checkpoint: {
            modelId: string;
            results: Map<string, boolean>;
        }) => Effect.Effect<void, never, never>;
        readonly loadCheckpoints: () => Effect.Effect<readonly {
            modelId: string;
            results: Map<string, boolean>;
        }[], never, never>;
        readonly saveDataset: (version: string, dataset: ReadonlyArray<TrainingSample>) => Effect.Effect<{
            version: string;
            createdAt: string;
            count: number;
            slices: {
                gold: number;
                hardNegative: number;
                replay: number;
            };
            samples: readonly TrainingSample[];
        }, never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
export declare class Store extends Store_base {
}
export declare const StoreLive: import("effect/Layer").Layer<Store, never, never>;
export {};
//# sourceMappingURL=store.d.ts.map