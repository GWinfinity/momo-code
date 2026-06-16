/**
 * Runtime flags for controlling Effect behavior in momo Code.
 */
import { Effect } from "effect";
declare const RuntimeFlags_base: Effect.Service.Class<RuntimeFlags, "RuntimeFlags", {
    readonly effect: Effect.Effect<{
        setLogger: Effect.Effect<boolean, never, never>;
        isDebug: Effect.Effect<boolean, never, never>;
    }, never, never>;
}>;
/**
 * RuntimeFlags provides configuration for the Effect runtime.
 */
export declare class RuntimeFlags extends RuntimeFlags_base {
}
export declare const RuntimeFlagsLive: import("effect/Layer").Layer<RuntimeFlags, never, never>;
export {};
//# sourceMappingURL=runtime-flags.d.ts.map