/**
 * Provider error types for momo Code.
 * Defines all error variants that can occur during provider operations
 * including stream errors, timeouts, and model resolution failures.
 */
import { Data } from "effect";
/**
 * Base error type for all provider-related errors.
 */
export class ProviderError extends Data.TaggedError("ProviderError") {
}
/**
 * Error thrown when a streaming response encounters a failure.
 */
export class ResponseStreamError extends Data.TaggedError("ResponseStreamError") {
}
/**
 * Error thrown when a chunk timeout occurs during streaming.
 */
export class ChunkTimeoutError extends Data.TaggedError("ChunkTimeoutError") {
}
/**
 * Error thrown when the requested model cannot be found or resolved.
 */
export class ModelResolutionError extends Data.TaggedError("ModelResolutionError") {
}
/**
 * Error thrown when a provider factory fails to initialize.
 */
export class ProviderInitializationError extends Data.TaggedError("ProviderInitializationError") {
}
/**
 * Error thrown when authentication fails for a provider.
 */
export class ProviderAuthError extends Data.TaggedError("ProviderAuthError") {
}
/**
 * Error thrown when the model catalog cannot be fetched.
 */
export class ModelCatalogError extends Data.TaggedError("ModelCatalogError") {
}
//# sourceMappingURL=error.js.map