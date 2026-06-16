/**
 * momo Code Self-Evolution System — /fine-tune command entry point
 *
 * Implements Pioneer Agent's Monte Carlo Graph Search (MCGS) for
 * automated fine-tuning of the coding agent's model based on its
 * own work trajectories.
 *
 * Architecture:
 * - FineTune service: Main orchestrator that runs the MCGS loop
 * - Miner: Extracts signals and clusters failures from sessions
 * - Curriculum: Builds three-slice training datasets with quality controls
 * - Search: MCGS graph search with EXPAND/SCORE/FUSE/PRUNE
 * - Policy: Iterative decision tree (<0.80 rebuild / 0.80-0.95 tune / >0.95 surgical)
 * - Trainer: Dispatches training to Tinker/Felix/Local backends
 * - Evaluator: Runs eval with cross-checkpoint ratchet gate
 * - Registry: Model version management and hot-swap
 * - Provenance: data-curation.md audit trail
 * - Store: State persistence
 * - Guard: Security and privacy scrubbing
 *
 * Reference: arXiv 2604.09791 (Pioneer Agent, Fastino Labs)
 * Paper sections: §2.1-§2.8, §21.4, §28
 */
import { Effect, Layer, Option } from "effect";
import { Miner } from "./miner";
import { Curriculum } from "./curriculum";
import { Search } from "./search";
import { Policy } from "./policy";
import { Trainer } from "./trainer";
import { Evaluator } from "./evaluator";
import { Registry } from "./registry";
import { Provenance } from "./provenance";
import { Store } from "./store";
/**
 * DataSpec — The data slice specification (D in π=(D,H,S)).
 *
 * Contains the three-slice recipe:
 * - Gold: Correct samples from successful sessions
 * - Hard negatives: Similar inputs with wrong outputs (contrastive learning)
 * - Replay: Historical samples to prevent catastrophic forgetting
 */
export interface DataSpec {
    readonly gold: ReadonlyArray<TrainingSample>;
    readonly hardNegatives: ReadonlyArray<TrainingSample>;
    readonly replay: ReadonlyArray<TrainingSample>;
    readonly qualityConstraints: QualityConstraints;
}
/**
 * HyperParams — The hyperparameter configuration (H in π=(D,H,S)).
 *
 * Controls the training process:
 * - Base model: The foundation model to fine-tune
 * - LoRA rank: Low-rank adaptation dimension
 * - Learning rate: Step size for gradient descent
 * - Batch size: Samples per training step
 * - Epochs: Full passes through the dataset
 * - System prompt: The behavior-shaping prompt
 */
export interface HyperParams {
    readonly baseModel: string;
    readonly loraRank: number;
    readonly learningRate: number;
    readonly batchSize: number;
    readonly epochs: number;
    readonly systemPrompt: string;
}
/**
 * LearningStrategy — The learning strategy (S in π=(D,H,S)).
 *
 * Controls how the model learns:
 * - Format: Direct answer vs Chain-of-Thought reasoning
 * - Teacher model: Model used to generate CoT annotations
 * - Eval method: pass@1 (single attempt) or pass@k (k attempts)
 */
export interface LearningStrategy {
    readonly format: "direct" | "cot";
    readonly teacherModel: string;
    readonly evalMethod: "pass@1" | "pass@k";
}
/**
 * TrainingPipeline — The full pipeline π=(D,H,S).
 *
 * This is the unit of search in MCGS. Each node in the search graph
 * represents a complete pipeline configuration.
 *
 * Reference: Pioneer Agent §2 — "The training pipeline π is a tuple
 * of data specification D, hyperparameters H, and learning strategy S."
 */
export interface TrainingPipeline {
    readonly D: DataSpec;
    readonly H: HyperParams;
    readonly S: LearningStrategy;
}
/**
 * TrainingSample — A single training example.
 *
 * Can be one of three types (three-slice recipe):
 * - gold: Correct sample from a successful session
 * - hard-negative: Wrong action paired with correction
 * - replay: Historical sample for retention
 */
export interface TrainingSample {
    readonly id: string;
    readonly context: string;
    readonly action: string;
    readonly expected: string;
    readonly verdict: "pass" | "fail";
    readonly reason?: string;
    readonly cot?: string;
    readonly source: string;
    readonly _tag: "gold" | "hard-negative" | "replay";
}
/**
 * QualityConstraints — The five quality control rules.
 *
 * Reference: Pioneer Agent §2.3 — Five quality controls:
 * 1. twoForOne: Each hard-neg paired with 1 gold + 1 hard-neg
 * 2. labelBalance: Any label <= 3x least common
 * 3. contextLengthMatch: Training context lengths match real inputs
 * 4. entityDiversity: Same entity value <= 2-3 times
 * 5. cotAnnotated: Chain-of-Thought annotations present
 */
export interface QualityConstraints {
    readonly twoForOne: boolean;
    readonly labelBalance: boolean;
    readonly contextLengthMatch: boolean;
    readonly entityDiversity: boolean;
    readonly cotAnnotated: boolean;
}
/**
 * EvalScore — The evaluation result for a model.
 *
 * Contains:
 * - pass@1: Fraction of tasks passed on first attempt
 * - regressionCount: Number of previously-passing tasks now failing
 * - calibratedConfidence: Confidence score calibrated to accuracy
 * - safetyScore: Safety evaluation score
 */
export interface EvalScore {
    readonly passAt1: number;
    readonly regressionCount: number;
    readonly calibratedConfidence: number;
    readonly safetyScore: number;
}
/**
 * MCNode — A node in the Monte Carlo search graph.
 *
 * Each node represents a training pipeline π and its evaluation score.
 * The graph structure (parent/children) enables backtracking and
 * cross-branch fusion.
 *
 * Reference: Pioneer Agent §2.4 — "MCGS represents the search space
 * as a graph where nodes are pipeline configurations."
 */
export interface MCNode {
    readonly id: string;
    readonly pi: TrainingPipeline;
    readonly score: Option.Option<EvalScore>;
    readonly parentId: Option.Option<string>;
    readonly children: ReadonlyArray<string>;
    readonly depth: number;
    readonly visits: number;
    readonly createdAt: Date;
}
/**
 * MCGraph — The full Monte Carlo search graph.
 *
 * Maintains all explored pipeline configurations and their scores.
 * Enables systematic exploration of the D/H/S search space.
 */
export interface MCGraph {
    nodes: Map<string, MCNode>;
    readonly rootId: string;
    bestNodeId: Option.Option<string>;
    iteration: number;
    budgetUsed: number;
}
/**
 * Options for the fine-tuning run.
 */
export interface FineTuneOpts {
    readonly window: number;
    readonly limit: number;
    readonly budget: number;
    readonly maxIters: number;
    readonly baseModel: string;
    readonly auto: boolean;
}
/**
 * Error raised when the ratchet gate rejects a candidate.
 */
export declare class RatchetGateError {
    readonly _tag = "RatchetGateError";
    readonly message = "Candidate failed ratchet gate \u2014 regression detected";
}
/**
 * Error raised when the budget is exhausted.
 */
export declare class BudgetExhaustedError {
    readonly _tag = "BudgetExhaustedError";
    readonly message = "Training budget exhausted";
    readonly budgetUsed: number;
    readonly budgetTotal: number;
    constructor(used: number, total: number);
}
/**
 * Error raised when no improvement is found after max iterations.
 */
export declare class StagnationError {
    readonly _tag = "StagnationError";
    readonly message = "Search stagnated \u2014 no improvement found";
}
declare const FineTune_base: Effect.Service.Class<FineTune, "evolve/FineTune", {
    readonly effect: Effect.Effect<{
        readonly run: (opts: FineTuneOpts) => Effect.Effect<MCNode, Error | RatchetGateError | StagnationError, never>;
        readonly status: () => Effect.Effect<Option.Option<import("./trainer").TrainingJob> | Option.Option<{
            id: string;
            status: string;
            modelId?: string;
        }>, never, never>;
        readonly promote: (jobId: string) => Effect.Effect<void, never, never>;
        readonly rollback: () => Effect.Effect<void, never, never>;
        readonly evalOnly: (modelId?: string) => Effect.Effect<EvalScore, never, never>;
    }, never, Store | Miner | Curriculum | Search | Policy | Trainer | Evaluator | Registry | Provenance>;
    readonly dependencies: readonly [Layer.Layer<Miner, never, never>, Layer.Layer<Curriculum, never, never>, Layer.Layer<Search, never, never>, Layer.Layer<Policy, never, never>, Layer.Layer<Trainer, never, never>, Layer.Layer<Evaluator, never, never>, Layer.Layer<Registry, never, never>, Layer.Layer<Provenance, never, never>, Layer.Layer<Store, never, never>];
}>;
/**
 * FineTune service — the main entry point for the self-evolution system.
 *
 * Implements the full MCGS loop:
 * 1. Diagnosis: Mine signals from sessions, cluster failures
 * 2. Initialize: Create MCGS graph with root = current production π₀
 * 3. MCGS Loop: SELECT → EXPAND → BUILD DATASET → TRAIN → EVAL → POLICY
 * 4. Ratchet Gate: Candidate must pass current + historical checkpoints
 * 5. Promotion: Stage candidate for human approval
 *
 * Reference: Pioneer Agent §2 — "The full self-evolution loop consists
 * of diagnosis, search, evaluation, and promotion with rollback safety."
 */
export declare class FineTune extends FineTune_base {
}
/**
 * Live layer for the FineTune service.
 * Composes all sub-service live layers.
 */
export declare const FineTuneLive: Layer.Layer<FineTune, never, never>;
export { Miner, MinerLive } from "./miner";
export type { ConfusionCluster, Taxonomy, Session, Signal } from "./miner";
export { Signals, SignalScorer, scoreSessionQuality, createTrainingPair, createDpoPair } from "./signals";
export { Curriculum, CurriculumLive } from "./curriculum";
export { Search, SearchLive } from "./search";
export { Policy, PolicyLive, type PolicyAction } from "./policy";
export { Trainer, TrainerLive, type TrainingJob, type TrainingHparams } from "./trainer";
export { Evaluator, EvaluatorLive, type RatchetOpts, type EvalResult } from "./evaluator";
export { Registry, RegistryLive, type ModelVersion } from "./registry";
export { Provenance, ProvenanceLive, type ProvenanceEntry } from "./provenance";
export { Store, StoreLive, type SessionRecord } from "./store";
export { Guard } from "./guard";
//# sourceMappingURL=index.d.ts.map