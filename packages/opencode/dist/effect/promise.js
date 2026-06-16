/**
 * Effect-Promise interop utilities.
 */
import { Effect } from "effect";
/**
 * Convert an Effect to a Promise.
 */
export function effectToPromise(effect) {
    return Effect.runPromise(effect);
}
/**
 * Convert a Promise-returning function to an Effect.
 */
export function promiseToEffect(fn) {
    return Effect.tryPromise({ try: fn, catch: (e) => e });
}
/**
 * EffectPromise namespace for common conversions.
 */
export const EffectPromise = {
    toPromise: effectToPromise,
    fromPromise: promiseToEffect,
};
//# sourceMappingURL=promise.js.map