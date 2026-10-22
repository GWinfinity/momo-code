/**
 * MOMO CODE - CLI command router
 */
import { createRequire } from "module"
import { printHelp } from "./help.js"
import { dispatchCommand } from "./dispatch.js"
import { runSetupCommand } from "./cmd/setup.js"
import { runRepl } from "./cmd/repl.js"
import { runChat } from "./chat.js"

const require = createRequire(import.meta.url)

const HELP_FLAGS = new Set(["help", "--help", "-h"])
const VERSION_FLAGS = new Set(["version", "--version", "-v"])

export async function runCli(argv: string[]): Promise<void> {
  if (argv.length === 0) {
    const code = await runRepl()
    process.exit(code)
    return
  }

  if (HELP_FLAGS.has(argv[0])) {
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

  // These two take over the process; keep them out of the shared dispatcher
  if (cmd === "repl") process.exit(await runRepl())
  if (cmd === "/setup" || cmd === "setup") process.exit(await runSetupCommand(args))

  if (await dispatchCommand(cmd, args)) return

  const prompt = [cmd, ...args].join(" ")
  const code = await runChat(prompt)
  if (code !== 0) process.exit(code)
}

function showVersion(): void {
  try {
    const { version } = require("../../package.json")
    console.log(version || "0.1.0")
  } catch {
    console.log("0.1.0")
  }
}
