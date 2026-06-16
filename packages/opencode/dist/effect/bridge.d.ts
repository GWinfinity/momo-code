/**
 * Effect-Promise bridge utilities.
 * Converts between Effect and Promise for interop with non-Effect code.
 */
import { Effect, Either } from "effect";
declare const EffectBridge_base: Effect.Service.Class<EffectBridge, "EffectBridge", {
    readonly effect: Effect.Effect<{
        runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
        runPromiseExit: <A, E>(effect: Effect.Effect<A, E>) => Promise<Either.Either<A, E>>;
        fromPromise: <A>(promise: () => Promise<A>) => Effect.Effect<A, unknown>;
    }, never, never>;
}>;
/**
 * Bridge for converting Effects to Promises and back.
 */
export declare class EffectBridge extends EffectBridge_base {
}
export declare const EffectBridgeLive: import("effect/Layer").Layer<EffectBridge, never, never>;
export {};
//# sourceMappingURL=bridge.d.ts.map