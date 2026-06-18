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
import { Effect, Ref } from "effect"
import { Option } from "effect"

export interface ModelVersion {
  readonly id: string           // e.g., "momo-coder-pro@ft-20260615-abc123"
  readonly baseModel: string
  readonly jobId: string
  readonly passAt1: number
  readonly promotedAt?: Date
  readonly status: "staged" | "production" | "archived" | "failed"
  readonly datasetVersion?: string
  readonly hyperparams?: unknown
}

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
export class Registry extends Effect.Service<Registry>()("evolve/Registry", {
  effect: Effect.gen(function* () {
    const versionsRef = yield* Ref.make<ReadonlyArray<ModelVersion>>([])

    /**
     * Stage a new model version that has passed evaluation.
     * The model is registered but not yet in production.
     */
    const stage = (modelId: string) =>
      Effect.gen(function* () {
        const baseName = modelId.includes("@ft-")
          ? modelId.split("@ft-")[0]
          : modelId
        const jobPart = modelId.includes("@ft-")
          ? modelId.split("@ft-")[1]
          : modelId

        const version: ModelVersion = {
          id: modelId,
          baseModel: baseName,
          jobId: jobPart,
          passAt1: 0, // Will be updated when eval results are attached
          status: "staged",
        }

        yield* Ref.update(versionsRef, (vs) => {
          // Prevent duplicates
          if (vs.some((v) => v.id === modelId)) return vs
          return [...vs, version]
        })

        yield* Effect.log(`[Registry] Staged: ${modelId}`)
      })

    /**
     * Promote a staged model to production.
     *
     * The current production model is archived (kept for rollback).
     * The new model becomes the active production model.
     *
     * Reference: Pioneer Agent §2.6 — "Promotion performs a hot-swap
     * of the production model with zero downtime."
     */
    const promote = (modelId: string) =>
      Effect.gen(function* () {
        // Step 1: Archive current production
        yield* Ref.update(versionsRef, (vs) =>
          vs.map((v) =>
            v.status === "production"
              ? { ...v, status: "archived" as const }
              : v,
          ),
        )

        // Step 2: Promote the new version
        yield* Ref.update(versionsRef, (vs) =>
          vs.map((v) =>
            v.id === modelId
              ? {
                  ...v,
                  status: "production" as const,
                  promotedAt: new Date(),
                }
              : v,
          ),
        )

        yield* Effect.log(`[Registry] PROMOTED to production: ${modelId}`)
        yield* Effect.log(
          `[Registry] Previous production model archived for rollback`,
        )

        // Step 3: In production, update provider.ts routing here
        // provider.updateModelRoute("standard", modelId)
      })

    /**
     * Rollback to the most recently archived production model.
     *
     * This is the emergency brake — used when the production model
     * is found to have regressions after promotion.
     *
     * Reference: Pioneer Agent §2.6 — "Rollback restores the previous
     * production model within seconds."
     */
    const rollback = () =>
      Effect.gen(function* () {
        const versions = yield* Ref.get(versionsRef)
        const archived = versions
          .filter((v) => v.status === "archived")
          .sort(
            (a, b) =>
              (b.promotedAt?.getTime() || 0) - (a.promotedAt?.getTime() || 0),
          )
          .at(0)

        if (!archived) {
          yield* Effect.log(
            "[Registry] No archived version to roll back to",
          )
          return
        }

        // Archive current production
        yield* Ref.update(versionsRef, (vs) =>
          vs.map((v) =>
            v.status === "production"
              ? { ...v, status: "archived" as const }
              : v,
          ),
        )

        // Restore the most recent archived version
        yield* Ref.update(versionsRef, (vs) =>
          vs.map((v) =>
            v.id === archived.id
              ? {
                  ...v,
                  status: "production" as const,
                  promotedAt: new Date(),
                }
              : v,
          ),
        )

        yield* Effect.log(`[Registry] ROLLED BACK to: ${archived.id}`)

        // In production, update provider.ts routing here
        // provider.updateModelRoute("standard", archived.id)
      })

    /**
     * Mark a model version as failed (e.g., training failed).
     */
    const markFailed = (modelId: string) =>
      Ref.update(versionsRef, (vs) =>
        vs.map((v) => (v.id === modelId ? { ...v, status: "failed" as const } : v)),
      )

    /**
     * List all model versions.
     */
    const list = () => Ref.get(versionsRef)

    /**
     * Get the current production model.
     */
    const current = () =>
      Ref.get(versionsRef).pipe(
        Effect.map((vs) => {
          const prod = vs.find((v) => v.status === "production")
          return prod ? Option.some(prod) : Option.none()
        }),
      )

    /**
     * Get the most recently archived model (rollback target).
     */
    const lastArchived = () =>
      Ref.get(versionsRef).pipe(
        Effect.map((vs) => {
          const archived = vs
            .filter((v) => v.status === "archived")
            .sort(
              (a, b) =>
                (b.promotedAt?.getTime() || 0) -
                (a.promotedAt?.getTime() || 0),
            )
            .at(0)
          return archived ? Option.some(archived) : Option.none()
        }),
      )

    return { stage, promote, rollback, markFailed, list, current, lastArchived } as const
  }),
  dependencies: [],
}) {}

export const RegistryLive = Registry.Default
