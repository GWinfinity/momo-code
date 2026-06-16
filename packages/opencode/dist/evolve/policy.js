/**
 * Iterative Strategy Decision Tree (Pioneer Agent §2.4 / §21.4)
 *
 * Classification thresholds:
 *   pass@1 < 0.80  → Data problem → Rebuild dataset
 *   0.80–0.95      → Optimization problem → Tune hyperparameters
 *   > 0.95          → Finishing → Surgical sample addition
 *   Regression      → Rollback immediately
 *
 * Reference: Pioneer Agent §21.4 — "The policy maps eval scores to
 * actions: data rebuild, hyperparameter tuning, or surgical addition."
 */
import { Effect, Ref } from "effect";
/**
 * Policy service — classifies eval scores and decides next actions.
 *
 * Maintains internal state across iterations to detect stagnation
 * and regression trends.
 */
export class Policy extends Effect.Service()("evolve/Policy", {
    effect: Effect.gen(function* () {
        const lastScoreRef = yield* Ref.make(Option.none());
        const stagnationCountRef = yield* Ref.make(0);
        const historyRef = yield* Ref.make([]);
        /**
         * Classify an eval score into a policy action.
         *
         * The decision tree follows Pioneer Agent's methodology:
         * 1. Check for regression first (safety)
         * 2. Classify by pass@1 threshold
         * 3. Track stagnation for evolution triggers
         */
        const classify = (score) => {
            return Effect.gen(function* () {
                const lastScoreOpt = yield* Ref.get(lastScoreRef);
                const stagnationCount = yield* Ref.get(stagnationCountRef);
                // Check regression first — safety is paramount
                if (lastScoreOpt._tag === "Some" &&
                    score.passAt1 < lastScoreOpt.value.passAt1) {
                    const newCount = stagnationCount + 1;
                    yield* Ref.set(stagnationCountRef, newCount);
                    // If regression persists for 3+ iterations, rollback
                    if (newCount >= 3) {
                        return {
                            _tag: "rollback",
                            reason: `Persistent regression detected over ${newCount} iterations: ${lastScoreOpt.value.passAt1.toFixed(3)} → ${score.passAt1.toFixed(3)}`,
                            previousScore: lastScoreOpt.value.passAt1,
                            currentScore: score.passAt1,
                        };
                    }
                    // Otherwise try hyperparameter tuning to recover
                    return {
                        _tag: "tune-hyperparams",
                        reason: `Regression detected: ${lastScoreOpt.value.passAt1.toFixed(3)} → ${score.passAt1.toFixed(3)}. Attempting recovery via hyperparameter adjustment.`,
                        suggestedLoraRank: 32, // Increase capacity
                        suggestedLr: 1e-4, // Lower LR for stability
                    };
                }
                // Reset stagnation on improvement
                if (lastScoreOpt._tag === "Some" && score.passAt1 > lastScoreOpt.value.passAt1) {
                    yield* Ref.set(stagnationCountRef, 0);
                }
                // Update state
                yield* Ref.set(lastScoreRef, Option.some(score));
                yield* Ref.update(historyRef, (h) => [...h, score]);
                // Classification thresholds per Pioneer Agent §21.4
                if (score.passAt1 < 0.8) {
                    return {
                        _tag: "rebuild-data",
                        reason: `Low pass@1 (${(score.passAt1 * 100).toFixed(1)}%): insufficient or mislabeled training data. Rebuild curriculum with more gold samples and better hard negatives.`,
                    };
                }
                if (score.passAt1 < 0.95) {
                    return {
                        _tag: "tune-hyperparams",
                        reason: `Moderate pass@1 (${(score.passAt1 * 100).toFixed(1)}%): optimize LoRA rank, learning rate, and epochs for marginal gains.`,
                        suggestedLoraRank: score.passAt1 < 0.85 ? 32 : 16,
                        suggestedLr: score.passAt1 < 0.85 ? 2e-4 : 1e-4,
                    };
                }
                if (score.regressionCount <= 2) {
                    return {
                        _tag: "promote",
                        reason: `High pass@1 (${(score.passAt1 * 100).toFixed(1)}%) with acceptable regression count (${score.regressionCount}). Candidate ready for promotion.`,
                    };
                }
                // Near-saturation with some regressions — surgical targeted fixes
                return {
                    _tag: "surgical",
                    reason: `Near-saturation (${(score.passAt1 * 100).toFixed(1)}%) with ${score.regressionCount} remaining regressions. Add targeted samples for specific failure clusters.`,
                    targetClusters: [], // Filled by caller based on eval analysis
                };
            });
        };
        /**
         * Check if training has stagnated (no improvement for N iterations).
         * Triggers FUSE or evolution when stagnation threshold is reached.
         *
         * Reference: Pioneer Agent §2.5 — "Stagnation triggers cross-branch
         * fusion or trajectory-aware mutation."
         */
        const isStagnated = (threshold) => {
            return Ref.get(stagnationCountRef).pipe(Effect.map((count) => count >= threshold));
        };
        /**
         * Get the full score history for trend analysis.
         */
        const getHistory = () => {
            return Ref.get(historyRef);
        };
        /**
         * Reset internal state (e.g., after a rollback or promotion).
         */
        const reset = () => {
            return Effect.gen(function* () {
                yield* Ref.set(lastScoreRef, Option.none());
                yield* Ref.set(stagnationCountRef, 0);
            });
        };
        return { classify, isStagnated, getHistory, reset };
    }),
    dependencies: [],
}) {
}
// Need Option for the Ref type
import { Option } from "effect";
export const PolicyLive = Policy.Default;
//# sourceMappingURL=policy.js.map