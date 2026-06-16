/**
 * Effect-Promise bridge utilities.
 * Converts between Effect and Promise for interop with non-Effect code.
 */

import { Effect, Either } from "effect"

/**
 * Bridge for converting Effects to Promises and back.
 */
export class EffectBridge extends Effect.Service<EffectBridge>()("EffectBridge", {
  effect: Effect.gen(function* () {
    /**
     * Run an Effect as a Promise.
     */
    const runPromise = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
      return Effect.runPromise(effect)
    }

    /**
     * Run an Effect as a Promise with error handling.
     */
    const runPromiseExit = <A, E>(
      effect: Effect.Effect<A, E>,
    ): Promise<Either.Either<A, E>> => {
      return Effect.runPromise(Effect.either(effect))
    }

    /**
     * Lift a Promise into an Effect.
     */
    const fromPromise = <A>(
      promise: () => Promise<A>,
    ): Effect.Effect<A, unknown> => {
      return Effect.tryPromise({ try: promise, catch: (e) => e })
    }

    return { runPromise, runPromiseExit, fromPromise }
  }),
}) {}

export const EffectBridgeLive = EffectBridge.Default
