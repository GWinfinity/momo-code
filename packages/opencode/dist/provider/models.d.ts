/**
 * Model catalog fetching and management for momo Code.
 * Provides functions to retrieve the model catalog from the remote registry.
 */
import { Effect } from "effect";
import { ModelCatalogError } from "./error";
/**
 * Get the model catalog URL from environment or fallback to default.
 * MOMO_MODELS_URL can override the default for testing or custom deployments.
 */
export declare function getModelsUrl(): string;
/**
 * Fetch the model catalog from the remote registry.
 * Returns the parsed JSON catalog containing all available models.
 */
export declare function fetchModelCatalog(): Effect.Effect<unknown, ModelCatalogError>;
/**
 * Model catalog entry as returned by the API.
 */
export interface ModelCatalogEntry {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly contextWindow?: number;
    readonly provider: string;
    readonly status?: string;
    readonly tier?: "ultra" | "standard" | "lite";
    readonly capabilities?: readonly string[];
    readonly pricing?: {
        readonly input?: number;
        readonly output?: number;
    };
}
/**
 * Parsed model catalog structure.
 */
export interface ModelCatalog {
    readonly models: readonly ModelCatalogEntry[];
    readonly version: string;
    readonly updatedAt: string;
}
//# sourceMappingURL=models.d.ts.map