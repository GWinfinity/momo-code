/**
 * Model Registry — Version management, promotion, and hot-swap.
 *
 * When a candidate passes the ratchet gate:
 * 1. Register it in the model catalog with version tag
 * 2. Update provider.ts to route 'standard' tier to the new adapter
 * 3. Keep old version as fallback for instant rollback
 *
 * Reference: Pioneer Agent §2.6 — "The registry maintains versioned
 * checkpoints with instant rollback capability."
 */
import { Effect } from "effect";
import { Option } from "effect";
export interface ModelVersion {
    readonly id: string;
    readonly baseModel: string;
    readonly jobId: string;
    readonly passAt1: number;
    readonly promotedAt?: Date;
    readonly status: "staged" | "production" | "archived" | "failed";
    readonly datasetVersion?: string;
    readonly hyperparams?: unknown;
}
declare const Registry_base: Effect.Service.Class<Registry, "evolve/Registry", {
    readonly effect: Effect.Effect<{
        readonly stage: (modelId: string) => Effect.Effect<void, never, never>;
        readonly promote: (modelId: string) => Effect.Effect<void, never, never>;
        readonly rollback: () => Effect.Effect<void, never, never>;
        readonly markFailed: (modelId: string) => Effect.Effect<void, never, never>;
        readonly list: () => Effect.Effect<readonly ModelVersion[], never, never>;
        readonly current: () => Effect.Effect<Option.None<ModelVersion> | Option.Some<ModelVersion>, never, never>;
        readonly lastArchived: () => Effect.Effect<Option.None<ModelVersion> | Option.Some<ModelVersion>, never, never>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Registry service — manages the lifecycle of fine-tuned model versions.
 *
 * Operations:
 * - stage: Add a new candidate that passed evaluation
 * - promote: Move staged model to production (hot-swap)
 * - rollback: Revert to previous production model
 * - list: Show all versions
 * - current: Get current production model
 */
export declare class Registry extends Registry_base {
}
export declare const RegistryLive: import("effect/Layer").Layer<Registry, never, never>;
export {};
//# sourceMappingURL=registry.d.ts.map