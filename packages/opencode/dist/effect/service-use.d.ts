/**
 * Service use utilities for Effect.
 * Provides convenient helpers for accessing services in the Effect context.
 */
import { Effect, Context } from "effect";
/**
 * Get a service from the context and use it within an effect.
 */
export declare function serviceUse<T, A, E, R>(tag: Context.Tag<T, T>, use: (service: T) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R | T>;
/**
 * Access a service from the context as an effect.
 */
export declare function serviceAccess<T>(tag: Context.Tag<T, T>): Effect.Effect<T, never, T>;
//# sourceMappingURL=service-use.d.ts.map