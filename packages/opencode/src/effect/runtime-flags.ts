/**
 * Runtime flags for controlling Effect behavior in momo Code.
 */

import { Effect, Runtime } from "effect"

/**
 * RuntimeFlags provides configuration for the Effect runtime.
 */
export class RuntimeFlags extends Effect.Service<RuntimeFlags>()("RuntimeFlags", {
  effect: Effect.gen(function* () {
    const setLogger = Effect.sync(() => {
      // Configure logging based on MOMO_DEBUG env var
      const debugLevel = process.env.MOMO_DEBUG || "0"
      return debugLevel === "1" || debugLevel === "true"
    })

    const isDebug = Effect.sync(() => {
      return process.env.MOMO_DEBUG === "1" || process.env.MOMO_DEBUG === "true"
    })

    return {
      setLogger,
      isDebug,
    }
  }),
}) {}

export const RuntimeFlagsLive = RuntimeFlags.Default
