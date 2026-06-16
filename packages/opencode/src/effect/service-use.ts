/**
 * Service use utilities for Effect.
 * Provides convenient helpers for accessing services in the Effect context.
 */

import { Effect, Context } from "effect"

/**
 * Get a service from the context and use it within an effect.
 */
export function serviceUse<T, A, E, R>(
  tag: Context.Tag<T, T>,
  use: (service: T) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | T> {
  return Effect.gen(function* () {
    const service = yield* Effect.context<T>().pipe(
      Effect.map((ctx) => Context.get(ctx, tag)),
    )
    return yield* use(service)
  })
}

/**
 * Access a service from the context as an effect.
 */
export function serviceAccess<T>(
  tag: Context.Tag<T, T>,
): Effect.Effect<T, never, T> {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context<T>()
    return Context.get(ctx, tag)
  })
}
