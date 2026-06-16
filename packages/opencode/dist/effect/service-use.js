/**
 * Service use utilities for Effect.
 * Provides convenient helpers for accessing services in the Effect context.
 */
import { Effect, Context } from "effect";
/**
 * Get a service from the context and use it within an effect.
 */
export function serviceUse(tag, use) {
    return Effect.gen(function* () {
        const service = yield* Effect.context().pipe(Effect.map((ctx) => Context.get(ctx, tag)));
        return yield* use(service);
    });
}
/**
 * Access a service from the context as an effect.
 */
export function serviceAccess(tag) {
    return Effect.gen(function* () {
        const ctx = yield* Effect.context();
        return Context.get(ctx, tag);
    });
}
//# sourceMappingURL=service-use.js.map