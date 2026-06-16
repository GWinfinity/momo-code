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
import type { Signal } from "../evolve/signals";
import { Collector, CollectorLive } from "./collector";
import { Distiller, DistillerLive } from "./distiller";
import { Selector, SelectorLive } from "./selector";
import { Injector, InjectorLive } from "./injector";
import { Solidify, SolidifyLive } from "./solidify";
import { Gate, GateLive } from "./gate";
import { Bridge, BridgeLive } from "./bridge";
import { ExperienceStore, ExperienceStoreLive } from "./store";
import { ExperienceGuard, ExperienceGuardLive } from "./guard";
export interface EvolveOpts {
    readonly sessionId: string;
    readonly signals: ReadonlyArray<Signal>;
    readonly review?: boolean;
    readonly mode?: "balanced" | "explore" | "harden" | "convention-only";
}
export interface TaskCtx {
    readonly id: string;
    readonly description: string;
    readonly repo?: string;
    readonly language?: string;
    readonly signals: ReadonlyArray<Signal>;
}
export declare const Evolve: (opts: EvolveOpts) => Effect.Effect<{
    tacticsCreated: number;
    constraintsCreated: number;
    promoted: number;
    verdict: import("./signals").Verdict;
}, Error, Distiller | Collector | ExperienceStore | Gate | Bridge>;
export declare const InjectForTask: (task: TaskCtx) => Effect.Effect<import("./injector").InjectResult | {
    block: string;
    tacticIds: never[];
    estimatedTokens: number;
}, never, Selector | Injector>;
export declare const SolidifyHook: (taskId: string, verdict: "pass" | "fail" | "partial", tacticIds: ReadonlyArray<string>) => Effect.Effect<void, Error, Solidify>;
export { Collector, CollectorLive };
export { Distiller, DistillerLive };
export { Selector, SelectorLive };
export { Injector, InjectorLive };
export { Solidify, SolidifyLive };
export { Gate, GateLive };
export { Bridge, BridgeLive };
export { ExperienceStore, ExperienceStoreLive };
export { ExperienceGuard, ExperienceGuardLive };
export * from "./tactic";
export * from "./case";
export * from "./signals";
export * from "./ledger";
export * from "./config";
export type { DistillResult } from "./distiller";
export type { SelectionOpts, TaskContext, RankedTactic } from "./selector";
export type { InjectResult, InjectOpts } from "./injector";
export type { ApplyVerdictOpts } from "./solidify";
//# sourceMappingURL=index.d.ts.map