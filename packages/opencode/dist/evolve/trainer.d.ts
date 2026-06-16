/**
 * Training Driver — Three backends: Tinker SDK / Felix / Local (PEFT)
 *
 * MOMO_EVOLVE_DRIVER env selects the backend:
 * - "tinker": Tinker SDK (paper's training stack) — recommended for reproduction
 * - "felix": Felix commercial API — fastest to production
 * - "local": Local PEFT/LoRA with vLLM — for privatization
 *
 * Reference: Pioneer Agent §2.3 — "Training is dispatched to the
 * appropriate driver based on deployment constraints."
 */
import { Effect, Option } from "effect";
import type { LearningStrategy, TrainingSample } from "./index";
export interface TrainingJob {
    readonly id: string;
    readonly modelId: string;
    readonly status: "queued" | "running" | "completed" | "failed";
    readonly datasetSize: number;
    readonly hparams: TrainingHparams;
    readonly startedAt?: Date;
    readonly completedAt?: Date;
    readonly checkpointUrl?: string;
    readonly logs?: ReadonlyArray<string>;
}
export interface TrainingHparams {
    readonly baseModel: string;
    readonly loraRank: number;
    readonly learningRate: number;
    readonly batchSize: number;
    readonly epochs: number;
    readonly systemPrompt: string;
    readonly warmupSteps?: number;
    readonly weightDecay?: number;
    readonly maxSeqLength?: number;
}
declare const Trainer_base: Effect.Service.Class<Trainer, "evolve/Trainer", {
    readonly effect: Effect.Effect<{
        readonly launch: (dataset: ReadonlyArray<TrainingSample>, hparams: TrainingHparams, strategy: LearningStrategy) => Effect.Effect<TrainingJob, Error, never>;
        readonly status: (jobId: string) => Effect.Effect<Option.Option<TrainingJob>, never, never>;
        readonly awaitCompletion: (jobId: string) => Effect.Effect<Option.Option<TrainingJob>, never, never>;
        readonly list: () => Effect.Effect<readonly TrainingJob[], never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Trainer service — dispatches training jobs to the appropriate backend.
 *
 * The backend is selected via MOMO_EVOLVE_DRIVER env var:
 * - tinker: Tinker SDK (paper's stack) for reproduction
 * - felix: Felix commercial API for fast iteration
 * - local: Local PEFT/LoRA for air-gapped environments
 */
export declare class Trainer extends Trainer_base {
}
/**
 * Serialize a dataset to the format expected by the training backend.
 */
export declare function serializeDataset(samples: ReadonlyArray<TrainingSample>, format: "direct" | "cot"): string;
export declare const TrainerLive: import("effect/Layer").Layer<Trainer, never, never>;
export {};
//# sourceMappingURL=trainer.d.ts.map