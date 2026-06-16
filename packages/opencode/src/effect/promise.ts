/**
 * Effect-Promise interop utilities.
 */

import { Effect } from "effect"

/**
 * Convert an Effect to a Promise.
 */
export function effectToPromise<A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> {
  return Effect.runPromise(effect)
}

/**
 * Convert a Promise-returning function to an Effect.
 */
export function promiseToEffect<A>(
  fn: () => Promise<A>,
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({ try: fn, catch: (e) => e })
}

/**
 * EffectPromise namespace for common conversions.
 */
export const EffectPromise = {
  toPromise: effectToPromise,
  fromPromise: promiseToEffect,
} as const
