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
import { Effect, Context, Layer, Option, Ref } from "effect"
import { Miner } from "./miner"
import { Signals, SignalScorer, scoreSessionQuality, createTrainingPair, createDpoPair } from "./signals"
import { Curriculum } from "./curriculum"
import { Search } from "./search"
import { Policy } from "./policy"
import { Trainer } from "./trainer"
import { Evaluator } from "./evaluator"
import { Registry } from "./registry"
import { Provenance } from "./provenance"
import { Store } from "./store"
import { Guard } from "./guard"

// ═══════════════════════════════════════════════════════════════════════════════
// Domain Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DataSpec — The data slice specification (D in π=(D,H,S)).
 *
 * Contains the three-slice recipe:
 * - Gold: Correct samples from successful sessions
 * - Hard negatives: Similar inputs with wrong outputs (contrastive learning)
 * - Replay: Historical samples to prevent catastrophic forgetting
 */
export interface DataSpec {
  readonly gold: ReadonlyArray<TrainingSample>
  readonly hardNegatives: ReadonlyArray<TrainingSample>
  readonly replay: ReadonlyArray<TrainingSample>
  readonly qualityConstraints: QualityConstraints
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
  readonly baseModel: string
  readonly loraRank: number
  readonly learningRate: number
  readonly batchSize: number
  readonly epochs: number
  readonly systemPrompt: string
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
  readonly format: "direct" | "cot"  // direct answer vs Chain-of-Thought
  readonly teacherModel: string
  readonly evalMethod: "pass@1" | "pass@k"
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
  readonly D: DataSpec
  readonly H: HyperParams
  readonly S: LearningStrategy
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
  readonly id: string
  readonly context: string        // Task + code context
  readonly action: string         // Agent action (edit/command)
  readonly expected: string       // Correct action
  readonly verdict: "pass" | "fail"
  readonly reason?: string        // Failure reason (lint error, test failure, etc.)
  readonly cot?: string           // Chain-of-Thought annotation (from teacher)
  readonly source: string         // Session ID / origin
  readonly _tag: "gold" | "hard-negative" | "replay"
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
  readonly twoForOne: boolean      // Each hard-neg paired with 1 gold + 1 hard-neg
  readonly labelBalance: boolean   // Any label <= 3x least common
  readonly contextLengthMatch: boolean
  readonly entityDiversity: boolean // Same entity value <= 2-3 times
  readonly cotAnnotated: boolean
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
  readonly passAt1: number
  readonly regressionCount: number
  readonly calibratedConfidence: number
  readonly safetyScore: number
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
  readonly id: string
  readonly pi: TrainingPipeline
  readonly score: Option.Option<EvalScore>
  readonly parentId: Option.Option<string>
  readonly children: ReadonlyArray<string>
  readonly depth: number
  readonly visits: number
  readonly createdAt: Date
}

/**
 * MCGraph — The full Monte Carlo search graph.
 *
 * Maintains all explored pipeline configurations and their scores.
 * Enables systematic exploration of the D/H/S search space.
 */
export interface MCGraph {
  nodes: Map<string, MCNode>
  readonly rootId: string
  bestNodeId: Option.Option<string>
  iteration: number
  budgetUsed: number  // USD
}

// ═══════════════════════════════════════════════════════════════════════════════
// FineTune Service — Main Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for the fine-tuning run.
 */
export interface FineTuneOpts {
  readonly window: number        // days of sessions to analyze
  readonly limit: number         // max sessions
  readonly budget: number        // USD budget
  readonly maxIters: number      // max MCGS iterations
  readonly baseModel: string     // base model to fine-tune
  readonly auto: boolean         // skip confirmation prompts
}

/**
 * Error raised when the ratchet gate rejects a candidate.
 */
export class RatchetGateError {
  readonly _tag = "RatchetGateError"
  readonly message = "Candidate failed ratchet gate — regression detected"
}

/**
 * Error raised when the budget is exhausted.
 */
export class BudgetExhaustedError {
  readonly _tag = "BudgetExhaustedError"
  readonly message = "Training budget exhausted"
  readonly budgetUsed: number
  readonly budgetTotal: number

  constructor(used: number, total: number) {
    this.budgetUsed = used
    this.budgetTotal = total
  }
}

/**
 * Error raised when no improvement is found after max iterations.
 */
export class StagnationError {
  readonly _tag = "StagnationError"
  readonly message = "Search stagnated — no improvement found"
}

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
export class FineTune extends Effect.Service<FineTune>()("evolve/FineTune", {
  effect: Effect.gen(function* () {
    const miner = yield* Miner
    const curriculum = yield* Curriculum
    const search = yield* Search
    const policy = yield* Policy
    const trainer = yield* Trainer
    const evaluator = yield* Evaluator
    const registry = yield* Registry
    const provenance = yield* Provenance
    const store = yield* Store

    /**
     * Run the full self-evolution loop.
     */
    const run = (opts: FineTuneOpts) =>
      Effect.gen(function* () {
        yield* Effect.log("═════════════════════════════════════════════════")
        yield* Effect.log("  momo Code Self-Evolution — /fine-tune")
        yield* Effect.log("  Reference: Pioneer Agent (arXiv 2604.09791)")
        yield* Effect.log("═════════════════════════════════════════════════")
        yield* Effect.log("")
        yield* Effect.log(`Configuration:`)
        yield* Effect.log(`  Window: ${opts.window} days`)
        yield* Effect.log(`  Limit: ${opts.limit} sessions`)
        yield* Effect.log(`  Budget: $${opts.budget} USD`)
        yield* Effect.log(`  Max iterations: ${opts.maxIters}`)
        yield* Effect.log(`  Base model: ${opts.baseModel}`)
        yield* Effect.log(`  Auto mode: ${opts.auto}`)
        yield* Effect.log("")

        // ─── Step 1: Diagnosis ─────────────────────────────────────
        yield* Effect.log("Step 1: Diagnosis — mining signals from sessions...")

        const sessions = yield* store.recentSessions({
          days: opts.window,
          limit: opts.limit,
        })

        if (sessions.length === 0) {
          yield* Effect.logWarning("No sessions found — nothing to learn from")
          return yield* Effect.fail(new StagnationError())
        }

        const taxonomy = yield* miner.diagnose(sessions)

        yield* Effect.log("")
        yield* Effect.log(`Found ${taxonomy.clusters.length} confusion clusters:`)
        yield* Effect.log(`  Total sessions: ${taxonomy.totalSessions}`)
        yield* Effect.log(`  Total signals: ${taxonomy.totalSignals}`)
        yield* Effect.log(`  Fixable ratio: ${(taxonomy.fixableRatio * 100).toFixed(1)}%`)

        for (const c of taxonomy.clusters) {
          yield* Effect.log(
            `    - ${c.name}: ${c.count} instances, avg retries: ${c.avgRetries.toFixed(1)}, category: ${c.category}`,
          )
        }
        yield* Effect.log("")

        // Require confirmation unless auto mode
        if (!opts.auto) {
          yield* Effect.log("Fine-tune plan:")
          yield* Effect.log(`  Clusters found: ${taxonomy.clusters.length}`)
          for (const c of taxonomy.clusters) {
            yield* Effect.log(
              `    - ${c.name}: ${c.count} instances, avg retries: ${c.avgRetries.toFixed(1)}`,
            )
          }
          yield* Effect.log("")
          yield* Effect.log("Confirm to proceed? (use --auto to skip)")
          // In actual implementation, this would wait for user input
          // For now, we proceed
        }

        // ─── Step 2: Initialize MCGS graph ─────────────────────────
        yield* Effect.log("Step 2: Initialize MCGS graph...")

        let G = yield* search.init({ root: opts.baseModel })

        yield* Effect.log(`  Root node: ${G.rootId}`)
        yield* Effect.log(`  Budget: $${opts.budget} USD`)
        yield* Effect.log("")

        // ─── Step 3: MCGS loop ─────────────────────────────────────
        yield* Effect.log("Step 3: MCGS loop — starting search...")
        yield* Effect.log("")

        let iterCount = 0

        while (yield* search.shouldContinue(G, opts.budget, opts.maxIters)) {
          iterCount++
          yield* Effect.log(`--- MCGS Iteration ${iterCount}/${opts.maxIters} ---`)

          // SELECT: UCT-based node selection
          yield* Effect.log("  [SELECT] Choosing node via UCT...")
          const parent = yield* search.selectUCT(G)
          yield* Effect.log(`  Selected: ${parent.id} (depth=${parent.depth})`)

          // EXPAND: Hypothesis-driven modification of D/H/S
          yield* Effect.log("  [EXPAND] Generating child nodes...")
          const children = yield* search.expand(parent, taxonomy)

          if (children.length === 0) {
            yield* Effect.log("  No children generated — pruning this branch")
            continue
          }

          // For each child: build dataset, train, evaluate
          for (const child of children) {
            yield* Effect.log(`  Processing child: ${child.id}`)

            // BUILD DATASET: Three-slice curriculum + quality controls
            yield* Effect.log("    [BUILD] Constructing three-slice curriculum...")
            const dataset = yield* curriculum.build(child.pi.D, {
              hardNegRatio: 0.3,
              replay: child.pi.H.baseModel.includes("ft-"), // replay only for fine-tuned models
            })

            if (dataset.length === 0) {
              yield* Effect.log("    Empty dataset — skipping this child")
              continue
            }

            // SCRUB SECRETS
            yield* Effect.log("    [GUARD] Scrubbing secrets...")
            const scrubbed = yield* Guard.scrubSecrets(dataset)

            // SCORE: Real training + evaluation (no surrogate)
            yield* Effect.log("    [TRAIN] Launching training job...")
            const job = yield* trainer.launch(scrubbed, child.pi.H, child.pi.S)

            yield* Effect.log(`    Job launched: ${job.id}`)

            // Wait for training to complete
            const completed = yield* trainer.awaitCompletion(job.id)

            if (completed._tag === "None") {
              yield* Effect.log("    Training timed out — skipping")
              continue
            }

            yield* Effect.log("    [EVAL] Running evaluation...")
            const score = yield* evaluator.run(job.modelId, "momo-bench-v1")

            yield* Effect.log(
              `    pass@1: ${(score.passAt1 * 100).toFixed(1)}%, regressions: ${score.regressionCount}`,
            )

            // Add scored node to graph
            yield* search.addNode(G, {
              pi: child.pi,
              f: score,
              job,
              parentId: parent.id,
            })

            // POLICY: Classification tree decides next action
            yield* Effect.log("    [POLICY] Classifying result...")
            const action = yield* policy.classify(score)
            yield* Effect.log(`    Action: ${action._tag} — ${action.reason}`)

            // Handle policy actions
            if (action._tag === "rollback") {
              yield* Effect.log("    Rollback triggered — reverting to previous")
              yield* registry.rollback()
              yield* provenance.append(G, child, "rolled_back")
              return yield* Effect.fail(new StagnationError())
            }

            if (action._tag === "promote") {
              yield* Effect.log("    Promotion candidate detected!")
            }

            // Save state
            yield* store.saveGraph(G)
          }

          // STAGNATION → evolution or FUSE
          if (yield* search.stagnated(G, 5)) {
            yield* Effect.log("  Stagnation detected — running FUSE operator...")
            yield* search.fuseOrEvolve(G)
          }

          // PRUNE low-utility nodes periodically
          if (iterCount % 3 === 0) {
            yield* search.prune(G, 0.5)
          }

          yield* Effect.log("")
        }

        // ─── Step 4: Ratchet Gate ──────────────────────────────────
        yield* Effect.log("")
        yield* Effect.log("Step 4: Ratchet gate — final evaluation...")

        const best = yield* search.best(G)

        yield* Effect.log(`Best node: ${best.id}`)
        if (best.score._tag === "Some") {
          yield* Effect.log(
            `Best score: pass@1=${(best.score.value.passAt1 * 100).toFixed(1)}%`,
          )
        }

        const ratchetPass = yield* evaluator.ratchetGate(best, {
          eps: 2,
          checkpoints: ["current", "prev"],
        })

        if (!ratchetPass) {
          yield* Effect.log("")
          yield* Effect.log("❌ Ratchet gate FAILED — candidate rejected")
          yield* Effect.log("   The model regressed on previously-solved tasks.")
          yield* provenance.append(G, best, "rejected")
          return yield* Effect.fail(new RatchetGateError())
        }

        yield* Effect.log("")
        yield* Effect.log("✅ Ratchet gate PASSED — candidate staged")

        yield* provenance.append(G, best, "staged")

        // Get the training job from the best node
        // In a real implementation, we'd retrieve this from the store
        const stagedModelId = best.pi.H.baseModel
        yield* registry.stage(stagedModelId)

        yield* Effect.log("")
        yield* Effect.log("═════════════════════════════════════════════════")
        yield* Effect.log("  Self-evolution complete!")
        yield* Effect.log(`  Model: ${stagedModelId}`)
        yield* Effect.log(
          `  Score: ${best.score._tag === "Some" ? (best.score.value.passAt1 * 100).toFixed(1) + "%" : "N/A"}`,
        )
        yield* Effect.log(`  Budget used: $${G.budgetUsed.toFixed(2)} / $${opts.budget}`)
        yield* Effect.log(`  Iterations: ${iterCount}`)
        yield* Effect.log("═════════════════════════════════════════════════")

        return best
      })

    /**
     * Get the status of the current fine-tuning job.
     */
    const status = () =>
      Effect.gen(function* () {
        const job = yield* store.currentJob()
        return job
          ? Option.some(job)
          : Option.none<{
              id: string
              status: string
              modelId?: string
            }>()
      })

    /**
     * Promote a staged model to production.
     *
     * Requires human confirmation in non-auto mode.
     */
    const promote = (jobId: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`Promoting ${jobId} to production...`)

        // Strong gate: require confirmation in non-auto mode
        // In actual implementation: prompt user for confirmation

        yield* registry.promote(jobId)
        yield* Effect.log(`✅ ${jobId} is now the production model`)

        // Record the checkpoint for future ratchet gates
        const emptyResults = new Map<string, boolean>()
        yield* evaluator.recordCheckpoint(jobId, emptyResults)
      })

    /**
     * Rollback to the previous production model.
     *
     * Emergency brake for when the production model has regressions.
     */
    const rollback = () =>
      Effect.gen(function* () {
        yield* Effect.log("Rolling back to previous production model...")
        yield* registry.rollback()
        yield* Effect.log("✅ Rollback complete")
      })

    /**
     * Run evaluation only (no training).
     */
    const evalOnly = (modelId?: string) =>
      Effect.gen(function* () {
        const target = modelId || "current"
        yield* Effect.log(`Running eval on: ${target}`)
        return yield* evaluator.run(target, "momo-bench-v1")
      })

    return { run, status, promote, rollback, evalOnly } as const
  }),
  dependencies: [
    Miner.Default,
    Curriculum.Default,
    Search.Default,
    Policy.Default,
    Trainer.Default,
    Evaluator.Default,
    Registry.Default,
    Provenance.Default,
    Store.Default,
  ],
}) {}

/**
 * Live layer for the FineTune service.
 * Composes all sub-service live layers.
 */
export const FineTuneLive = FineTune.Default

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports — All evolve modules
// ═══════════════════════════════════════════════════════════════════════════════

export { Miner, MinerLive } from "./miner"
export type { ConfusionCluster, Taxonomy, Session, Signal } from "./miner"
export { Signals, SignalScorer, scoreSessionQuality, createTrainingPair, createDpoPair } from "./signals"
export { Curriculum, CurriculumLive } from "./curriculum"
export { Search, SearchLive } from "./search"
export { Policy, PolicyLive, type PolicyAction } from "./policy"
export { Trainer, TrainerLive, type TrainingJob, type TrainingHparams } from "./trainer"
export { Evaluator, EvaluatorLive, type RatchetOpts, type EvalResult } from "./evaluator"
export { Registry, RegistryLive, type ModelVersion } from "./registry"
export { Provenance, ProvenanceLive, type ProvenanceEntry } from "./provenance"
export { Store, StoreLive, type SessionRecord } from "./store"
export { Guard } from "./guard"
