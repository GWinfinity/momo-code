/**
 * Provider error types for momo Code.
 * Defines all error variants that can occur during provider operations
 * including stream errors, timeouts, and model resolution failures.
 */

import { Data } from "effect"

/**
 * Base error type for all provider-related errors.
 */
export class ProviderError extends Data.TaggedError("ProviderError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Error thrown when a streaming response encounters a failure.
 */
export class ResponseStreamError extends Data.TaggedError("ResponseStreamError")<{
  readonly message: string
  readonly response?: Response
  readonly cause?: unknown
}> {}

/**
 * Error thrown when a chunk timeout occurs during streaming.
 */
export class ChunkTimeoutError extends Data.TaggedError("ChunkTimeoutError")<{
  readonly message: string
  readonly timeoutMs: number
  readonly cause?: unknown
}> {}

/**
 * Error thrown when the requested model cannot be found or resolved.
 */
export class ModelResolutionError extends Data.TaggedError("ModelResolutionError")<{
  readonly message: string
  readonly modelId?: string
  readonly cause?: unknown
}> {}

/**
 * Error thrown when a provider factory fails to initialize.
 */
export class ProviderInitializationError extends Data.TaggedError(
  "ProviderInitializationError",
)<{
  readonly message: string
  readonly providerName: string
  readonly cause?: unknown
}> {}

/**
 * Error thrown when authentication fails for a provider.
 */
export class ProviderAuthError extends Data.TaggedError("ProviderAuthError")<{
  readonly message: string
  readonly providerName: string
  readonly cause?: unknown
}> {}

/**
 * Error thrown when the model catalog cannot be fetched.
 */
export class ModelCatalogError extends Data.TaggedError("ModelCatalogError")<{
  readonly message: string
  readonly url: string
  readonly cause?: unknown
}> {}

/**
 * Union of all provider error types for error handling.
 */
export type ProviderErrors =
  | ProviderError
  | ResponseStreamError
  | ChunkTimeoutError
  | ModelResolutionError
  | ProviderInitializationError
  | ProviderAuthError
  | ModelCatalogError
