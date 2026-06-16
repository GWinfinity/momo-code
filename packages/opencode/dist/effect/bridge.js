/**
 * Effect-Promise bridge utilities.
 * Converts between Effect and Promise for interop with non-Effect code.
 */
import { Effect } from "effect";
/**
 * Bridge for converting Effects to Promises and back.
 */
export class EffectBridge extends Effect.Service()("EffectBridge", {
    effect: Effect.gen(function* () {
        /**
         * Run an Effect as a Promise.
         */
        const runPromise = (effect) => {
            return Effect.runPromise(effect);
        };
        /**
         * Run an Effect as a Promise with error handling.
         */
        const runPromiseExit = (effect) => {
            return Effect.runPromise(Effect.either(effect));
        };
        /**
         * Lift a Promise into an Effect.
         */
        const fromPromise = (promise) => {
            return Effect.tryPromise({ try: promise, catch: (e) => e });
        };
        return { runPromise, runPromiseExit, fromPromise };
    }),
}) {
}
export const EffectBridgeLive = EffectBridge.Default;
//# sourceMappingURL=bridge.js.map