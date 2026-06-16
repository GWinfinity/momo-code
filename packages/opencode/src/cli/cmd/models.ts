/**
 * CLI models command for momo Code.
 * Provides listing, search, and selection of available models.
 */

import { Effect } from "effect"
import { Auth } from "../../auth"
import { Config } from "../../config/config"
import { Env } from "../../env"
import {
  BUILTIN_TIERS,
  resolveTierModel,
  listAvailableProviders,
} from "../../provider/provider"
import { fetchModelCatalog, getModelsUrl } from "../../provider/models"
import { ModelCatalogError } from "../../provider/error"
import { ModelStatus } from "../../provider/model-status"

/**
 * Display format for model listings.
 */
interface ModelDisplayEntry {
  readonly id: string
  readonly name: string
  readonly provider: string
  readonly tier?: string
  readonly status: string
  readonly contextWindow?: number
}

/**
 * List all available models grouped by tier.
 */
export function listModels(): Effect.Effect<void> {
  return Effect.gen(function* () {
    console.log("")
    console.log("Available Models")
    console.log("================")
    console.log("")

    // Show built-in tiers
    console.log("Built-in Tiers:")
    console.log("")

    const tiers = [
      { name: "ultra", label: "Ultra", color: "\x1b[1;35m", reset: "\x1b[0m" },
      { name: "standard", label: "Standard", color: "\x1b[1;32m", reset: "\x1b[0m" },
      { name: "lite", label: "Lite", color: "\x1b[1;34m", reset: "\x1b[0m" },
    ] as const

    for (const tier of tiers) {
      const models = BUILTIN_TIERS[tier.name as keyof typeof BUILTIN_TIERS]
      console.log(
        `  ${tier.color}${tier.label}${tier.reset}: ${models.join(", ")}`,
      )
    }

    console.log("")
    console.log("Use --tier=<name> to select a tier, or --model=<id> for a specific model.")
    console.log("")

    // Try to fetch remote catalog
    const catalog = yield* Effect.either(fetchModelCatalog())

    if (catalog._tag === "Right") {
      const data = catalog.right as {
        models?: Array<{
          id: string
          name: string
          provider: string
          status?: string
          contextWindow?: number
          tier?: string
        }>
      }

      if (data.models && data.models.length > 0) {
        console.log("Remote Catalog Models:")
        console.log("")

        for (const model of data.models) {
          const statusColor =
            model.status === "available"
              ? "\x1b[32m"
              : model.status === "deprecated"
                ? "\x1b[33m"
                : "\x1b[31m"
          const reset = "\x1b[0m"
          console.log(
            `  ${model.id} (${model.provider}) ${statusColor}[${model.status || "unknown"}]${reset}`,
          )
          if (model.contextWindow) {
            console.log(`    Context: ${model.contextWindow.toLocaleString()} tokens`)
          }
        }
        console.log("")
      }
    }

    console.log(`Model catalog URL: ${getModelsUrl()}`)
    console.log("")
  })
}

/**
 * Show detailed info for a specific model.
 */
export function showModelInfo(modelId: string): Effect.Effect<void, never, Auth> {
  return Effect.gen(function* () {
    console.log("")
    console.log(`Model: ${modelId}`)
    console.log("=" .repeat(40))

    // Check if it's a tier
    if (modelId in BUILTIN_TIERS) {
      const tier = BUILTIN_TIERS[modelId as keyof typeof BUILTIN_TIERS]
      console.log(`Type: Tier (${modelId})`)
      console.log(`Models: ${tier.join(", ")}`)
      console.log("")
      console.log("This tier will automatically route to the first available model.")
      return
    }

    // Check provider prefix format (provider:model)
    if (modelId.includes(":")) {
      const [provider, model] = modelId.split(":", 2)
      console.log(`Provider: ${provider}`)
      console.log(`Model: ${model}`)
    } else {
      console.log(`Model ID: ${modelId}`)
    }

    // Try to resolve as a tier
    const resolved = yield* Effect.either(resolveTierModel(modelId))
    if (resolved._tag === "Right" && resolved.right) {
      console.log(`Resolved to: ${resolved.right}`)
    }

    console.log("")
  })
}

/**
 * Show available providers.
 */
export function showProviders(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const providers = listAvailableProviders()

    console.log("")
    console.log("Available Providers")
    console.log("===================")
    console.log("")

    for (const provider of providers) {
      const hasKey = process.env[`MOMO_${provider.envSuffix}_API_KEY`] || process.env.MOMO_API_KEY
      const status = hasKey ? "\x1b[32mconfigured\x1b[0m" : "\x1b[33mno key\x1b[0m"
      console.log(`  ${provider.name.padEnd(20)} ${status}`)
      if (provider.description) {
        console.log(`    ${provider.description}`)
      }
    }

    console.log("")
    console.log("Set MOMO_API_KEY for generic access, or provider-specific keys.")
    console.log("")
  })
}

/**
 * CLI argument parsing for the models command.
 */
export function parseModelsArgs(
  args: string[],
): { command: string; modelId?: string } {
  if (args.length === 0) {
    return { command: "list" }
  }

  const subcommand = args[0]

  switch (subcommand) {
    case "list":
    case "ls":
      return { command: "list" }
    case "info":
      return { command: "info", modelId: args[1] }
    case "providers":
      return { command: "providers" }
    default:
      return { command: "list" }
  }
}

/**
 * Execute the models CLI command.
 */
export function runModelsCommand(args: string[]): Effect.Effect<void, never, Auth> {
  return Effect.gen(function* () {
    const parsed = parseModelsArgs(args)

    switch (parsed.command) {
      case "list":
      case "ls":
        yield* listModels()
        break
      case "info":
        if (parsed.modelId) {
          yield* showModelInfo(parsed.modelId)
        } else {
          console.error("Usage: momo models info <model-id>")
        }
        break
      case "providers":
        yield* showProviders()
        break
      default:
        yield* listModels()
    }
  })
}
