/**
 * Provider request/response transformation utilities for momo Code.
 * Handles format conversions between different provider APIs and the internal model.
 */
import { Effect } from "effect";
declare const ProviderTransform_base: Effect.Service.Class<ProviderTransform, "ProviderTransform", {
    readonly effect: Effect.Effect<{
        transformRequest: (body: Record<string, unknown>, targetProvider: string) => Record<string, unknown>;
        transformResponse: (body: Record<string, unknown>, sourceProvider: string) => Record<string, unknown>;
        transformStreamChunk: (chunk: Record<string, unknown>, sourceProvider: string) => Record<string, unknown> | null;
    }, never, never>;
}>;
/**
 * Transform functions for adapting between provider-specific formats
 * and the unified internal representation.
 */
export declare class ProviderTransform extends ProviderTransform_base {
}
export {};
//# sourceMappingURL=transform.d.ts.map