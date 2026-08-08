/**
 * MOMO CODE - CLI command router
 */
import { Effect } from "effect"
import { createRequire } from "module"
import { AuthLive } from "../auth.js"
import { printHelp } from "./help.js"
import { runEvolveCommand } from "./cmd/evolve.js"
import { runFinetuneCommand } from "./cmd/finetune.js"
import { runModelsCommand } from "./cmd/models.js"
import { runChat } from "./chat.js"

const require = createRequire(import.meta.url)

const HELP_FLAGS = new Set(["help", "--help", "-h"])
const VERSION_FLAGS = new Set(["version", "--version", "-v"])

export async function runCli(argv: string[]): Promise<void> {
  if (argv.length === 0 || HELP_FLAGS.has(argv[0])) {
    printHelp()
    return
  }

  if (VERSION_FLAGS.has(argv[0])) {
    showVersion()
    return
  }

// Parse --model / --provider / -m / -p options
  let parsedModel: string | undefined
  let parsedProvider: string | undefined
  const remaining: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ((arg === "--model" || arg === "-m") && i + 1 < argv.length) {
      parsedModel = argv[++i]
    } else if ((arg === "--provider" || arg === "-p") && i + 1 < argv.length) {
      parsedProvider = argv[++i]
    } else {
      remaining.push(arg)
    }
  }

  // Apply parsed options to environment variables for downstream consumption
  if (parsedModel) process.env.MOMO_MODEL = parsedModel
  if (parsedProvider) process.env.MOMO_PROVIDER = parsedProvider

  const cmd = remaining[0]
  const args = remaining.slice(1)

  switch (cmd) {
    case "/evolve":
    case "evolve":
      await runEvolveCommand(args)
      break
    case "/fine-tune":
    case "/finetune":
    case "fine-tune":
    case "finetune":
      runFinetuneCommand(args)
      break
    case "models":
      await Effect.runPromise(
        runModelsCommand(args).pipe(
          Effect.provide(AuthLive),
          Effect.catchAll((err) => Effect.sync(() => {
            console.error("Error:", err instanceof Error ? err.message : String(err))
            process.exit(1)
          })),
        ),
      )
      break
    default:
      const prompt = [cmd, ...args].join(" ")
      const code = await runChat(prompt)
      if (code !== 0) process.exit(code)
      return
  }
}

function showVersion(): void {
  try {
    const { version } = require("../../package.json")
    console.log(version || "0.1.0")
  } catch {
    console.log("0.1.0")
  }
}
