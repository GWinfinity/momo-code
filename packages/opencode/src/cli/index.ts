/**
 * MOMO CODE - CLI command router
 */
import { Effect } from "effect"
import { renderBanner } from "./banner.js"
import { AuthLive } from "../auth.js"
import { runEvolveCommand } from "./cmd/evolve.js"
import { runFinetuneCommand } from "./cmd/finetune.js"
import { runModelsCommand } from "./cmd/models.js"
import { runChat } from "./chat.js"

const C = {
  b: "\x1b[1m", B: "\x1b[0m",
  c: "\x1b[36m", g: "\x1b[32m",
}
const DIM = "\x1b[37m"
const RESET = "\x1b[0m"

export async function runCli(argv: string[]): Promise<void> {
  if (argv.length === 0) { showHelp(); return }

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

function showHelp(): void {
  console.log(renderBanner())
  console.log(`${C.b}COMMANDS:${C.B}`)
  console.log(`  ${C.c}momo <prompt>${C.B}          Start coding session`)
  console.log(`  ${C.c}momo /evolve${C.B}           Experience fast loop (KEP)`)
  console.log(`  ${C.c}momo /fine-tune${C.B}        Self-evolution training (MCGS)`)
  console.log(`  ${C.c}momo models${C.B}            List models & providers`)
  console.log(`  ${C.c}momo help${C.B}              Show help`)
  console.log(``)
  console.log(`${DIM}Docs: https://momozi.cc${RESET}`)
  console.log(``)
}
