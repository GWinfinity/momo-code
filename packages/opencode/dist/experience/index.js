/**
 * Experience Evolution — Fast loop orchestrator (/evolve command)
 *
 * KEP (momo Evolution Protocol) defines three assets:
 * - Tactic: compact reusable strategy card
 * - Case: successful task record with injected tactics
 * - Ledger: append-only audit log
 *
 * 5-step loop: Observe → Distill → Select/Inject → Solidify → Promote
 * Two-speed bridge: promoted Tactics → fine-tune curriculum (bridge.ts)
 *
 * Reference: KEP §44-50
 */
import { Effect } from "effect";
import { Collector, CollectorLive } from "./collector.js";
import { Distiller, DistillerLive } from "./distiller.js";
import { Selector, SelectorLive } from "./selector.js";
import { Injector, InjectorLive } from "./injector.js";
import { Solidify, SolidifyLive } from "./solidify.js";
import { Gate, GateLive } from "./gate.js";
import { Bridge, BridgeLive } from "./bridge.js";
import { ExperienceStore, ExperienceStoreLive } from "./store.js";
import { ExperienceGuard, ExperienceGuardLive } from "./guard.js";
// ---------------------------------------------------------------------------
// /evolve command — runs full 5-step loop
// ---------------------------------------------------------------------------
export const Evolve = (opts) => Effect.gen(function* () {
    yield* Effect.log(`\u{1F9EC} momo experience evolution · session ${opts.sessionId} (mode=${opts.mode || "balanced"})`);
    // 1. Observe — already have signals, just compute verdict
    const collector = yield* Collector;
    const observation = yield* collector.fromSignals(opts.sessionId, opts.signals);
    yield* Effect.log(`  Observe: ${observation.signals.length} signals → verdict=${observation.verdict}`);
    // 2. Distill — success→draft tactics, failure→constraints
    const distiller = yield* Distiller;
    const store = yield* ExperienceStore;
    const existingTactics = yield* store.loadTactics();
    const distilled = yield* distiller.distill(opts.signals, { dedup: true }, existingTactics);
    yield* Effect.log(`  Distill: ${distilled.newCount} new, ${distilled.dedupHitCount} dedup hits`);
    // 3. Upsert new tactics
    if (distilled.tactics.length > 0) {
        yield* store.saveTactics([...existingTactics, ...distilled.tactics]);
    }
    // 4. Promote — draft→active→promoted
    const gate = yield* Gate;
    let promotedCount = 0;
    for (const t of distilled.tactics) {
        const next = yield* gate.maybePromote(t);
        if (next === "promoted") {
            promotedCount++;
            const bridge = yield* Bridge;
            yield* bridge.enqueueForFineTune(t);
        }
    }
    yield* Effect.log(`  Promote: ${promotedCount} → fine-tune curriculum`);
    // 5. Ledger entry
    yield* store.appendLedger({
        kind: "distill",
        tacticIds: distilled.tactics.map(t => t.id),
        summary: distilled.summary,
        timestamp: new Date().toISOString(),
    });
    yield* Effect.log(`  Ledger: written`);
    return {
        tacticsCreated: distilled.newCount,
        constraintsCreated: distilled.constraints.length,
        promoted: promotedCount,
        verdict: observation.verdict,
    };
});
// ---------------------------------------------------------------------------
// Auto-inject for new tasks (session.start hook)
// ---------------------------------------------------------------------------
export const InjectForTask = (task) => Effect.gen(function* () {
    const selector = yield* Selector;
    const injector = yield* Injector;
    // Build TaskContext for selector
    const taskContext = {
        signals: task.signals,
        repo: task.repo,
        language: task.language,
    };
    // 1. Retrieve candidates matching task signals
    const candidates = yield* selector.retrieve(taskContext);
    if (candidates.length === 0) {
        yield* Effect.log(`[Inject] No matching tactics for task ${task.id}`);
        return { block: "", tacticIds: [], estimatedTokens: 0 };
    }
    // 2. Rank by Thompson sampling
    const chosen = yield* selector.rankThompson(candidates, taskContext, {
        k: 6,
    });
    // 3. Format into prompt block (use top 6 ranked)
    const topRanked = chosen.slice(0, 6);
    const result = yield* injector.toPromptBlock(topRanked);
    yield* Effect.log(`[Inject] ${topRanked.length} tactics injected for task ${task.id}`);
    return result;
});
// ---------------------------------------------------------------------------
// Solidify hook (session.end)
// ---------------------------------------------------------------------------
export const SolidifyHook = (taskId, verdict, tacticIds) => Effect.gen(function* () {
    const solidify = yield* Solidify;
    yield* solidify.applyVerdict({
        sessionId: taskId,
        taskSignature: taskId,
        verdict,
        tacticIds,
        metrics: { durationMs: 0, toolCalls: 0, retries: 0 },
        signals: [],
    });
    yield* Effect.log(`[Solidify] Task ${taskId}: verdict=${verdict}, tactics updated`);
});
// ---------------------------------------------------------------------------
// Exports — Services + Lives
// ---------------------------------------------------------------------------
// Core services
export { Collector, CollectorLive };
export { Distiller, DistillerLive };
export { Selector, SelectorLive };
export { Injector, InjectorLive };
export { Solidify, SolidifyLive };
export { Gate, GateLive };
export { Bridge, BridgeLive };
export { ExperienceStore, ExperienceStoreLive };
export { ExperienceGuard, ExperienceGuardLive };
// Data models
export * from "./tactic.js";
export * from "./case.js";
export * from "./signals.js";
export * from "./ledger.js";
export * from "./config.js";
//# sourceMappingURL=index.js.map