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
