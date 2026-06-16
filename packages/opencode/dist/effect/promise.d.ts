/**
 * Effect-Promise interop utilities.
 */
import { Effect } from "effect";
/**
 * Convert an Effect to a Promise.
 */
export declare function effectToPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A>;
/**
 * Convert a Promise-returning function to an Effect.
 */
export declare function promiseToEffect<A>(fn: () => Promise<A>): Effect.Effect<A, unknown>;
/**
 * EffectPromise namespace for common conversions.
 */
export declare const EffectPromise: {
    readonly toPromise: typeof effectToPromise;
    readonly fromPromise: typeof promiseToEffect;
};
//# sourceMappingURL=promise.d.ts.map