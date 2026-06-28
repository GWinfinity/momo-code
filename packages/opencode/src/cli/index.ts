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

  const cmd = argv[0]
  const args = argv.slice(1)

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
          Effect.catchAll(() => Effect.void),
        ),
      )
      break
    default:
      // Treat all arguments as a coding prompt
      const prompt = [cmd, ...args].join(" ")
      const code = await runChat(prompt)
      process.exit(code)
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
