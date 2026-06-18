/**
 * Model catalog fetching and management for momo Code.
 * Provides functions to retrieve the model catalog from the remote registry.
 */

import { Effect } from "effect"
import { ModelCatalogError } from "./error"

/** Default URL for the momo model catalog. */
const DEFAULT_MODELS_URL = "https://models.dev"

/**
 * Get the model catalog URL from environment or fallback to default.
 * MOMO_MODELS_URL can override the default for testing or custom deployments.
 */
export function getModelsUrl(): string {
  return process.env.MOMO_MODELS_URL || DEFAULT_MODELS_URL
}

/**
 * Fetch the model catalog from the remote registry.
 * Returns the parsed JSON catalog containing all available models.
 */
export function fetchModelCatalog(): Effect.Effect<unknown, ModelCatalogError> {
  return Effect.gen(function* () {
    const url = getModelsUrl()
    const res = yield* Effect.tryPromise({
      try: () => fetch(`${url}/api.json`),
      catch: (error) =>
        new ModelCatalogError({
          message: `Failed to connect to model catalog at ${url}: ${error instanceof Error ? error.message : String(error)}`,
          url,
          cause: error,
        }),
    })

    if (!res.ok) {
      return yield* new ModelCatalogError({
        message: `Failed to fetch model catalog: HTTP ${res.status} ${res.statusText}`,
        url,
      })
    }

    const data = yield* Effect.tryPromise({
      try: () => res.json(),
      catch: (error) =>
        new ModelCatalogError({
          message: `Failed to parse model catalog JSON: ${error instanceof Error ? error.message : String(error)}`,
          url,
          cause: error,
        }),
    })

    return data
  })
}

/**
 * Model catalog entry as returned by the API.
 */
export interface ModelCatalogEntry {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly contextWindow?: number
  readonly provider: string
  readonly status?: string
  readonly tier?: "ultra" | "standard" | "lite"
  readonly capabilities?: readonly string[]
  readonly pricing?: {
    readonly input?: number
    readonly output?: number
  }
}

/**
 * Parsed model catalog structure.
 */
export interface ModelCatalog {
  readonly models: readonly ModelCatalogEntry[]
  readonly version: string
  readonly updatedAt: string
}
