/**
 * Provider error types for momo Code.
 * Defines all error variants that can occur during provider operations
 * including stream errors, timeouts, and model resolution failures.
 */
declare const ProviderError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ProviderError";
} & Readonly<A>;
/**
 * Base error type for all provider-related errors.
 */
export declare class ProviderError extends ProviderError_base<{
    readonly message: string;
    readonly cause?: unknown;
}> {
}
declare const ResponseStreamError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ResponseStreamError";
} & Readonly<A>;
/**
 * Error thrown when a streaming response encounters a failure.
 */
export declare class ResponseStreamError extends ResponseStreamError_base<{
    readonly message: string;
    readonly response?: Response;
    readonly cause?: unknown;
}> {
}
declare const ChunkTimeoutError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ChunkTimeoutError";
} & Readonly<A>;
/**
 * Error thrown when a chunk timeout occurs during streaming.
 */
export declare class ChunkTimeoutError extends ChunkTimeoutError_base<{
    readonly message: string;
    readonly timeoutMs: number;
    readonly cause?: unknown;
}> {
}
declare const ModelResolutionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ModelResolutionError";
} & Readonly<A>;
/**
 * Error thrown when the requested model cannot be found or resolved.
 */
export declare class ModelResolutionError extends ModelResolutionError_base<{
    readonly message: string;
    readonly modelId?: string;
    readonly cause?: unknown;
}> {
}
declare const ProviderInitializationError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ProviderInitializationError";
} & Readonly<A>;
/**
 * Error thrown when a provider factory fails to initialize.
 */
export declare class ProviderInitializationError extends ProviderInitializationError_base<{
    readonly message: string;
    readonly providerName: string;
    readonly cause?: unknown;
}> {
}
declare const ProviderAuthError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ProviderAuthError";
} & Readonly<A>;
/**
 * Error thrown when authentication fails for a provider.
 */
export declare class ProviderAuthError extends ProviderAuthError_base<{
    readonly message: string;
    readonly providerName: string;
    readonly cause?: unknown;
}> {
}
declare const ModelCatalogError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ModelCatalogError";
} & Readonly<A>;
/**
 * Error thrown when the model catalog cannot be fetched.
 */
export declare class ModelCatalogError extends ModelCatalogError_base<{
    readonly message: string;
    readonly url: string;
    readonly cause?: unknown;
}> {
}
/**
 * Union of all provider error types for error handling.
 */
export type ProviderErrors = ProviderError | ResponseStreamError | ChunkTimeoutError | ModelResolutionError | ProviderInitializationError | ProviderAuthError | ModelCatalogError;
export {};
//# sourceMappingURL=error.d.ts.map