/**
 * MOMO CODE — shared command dispatcher.
 *
 * Routes a command word (with or without a leading slash) to its handler.
 * Used by both the shell router (`cli/index.ts`) and the interactive REPL
 * bridge (`cli/cmd/repl.ts`), so both entry points expose the same command
 * set. Returns false for unrecognized commands so callers can fall back to
 * chat.
 */
import { Effect } from "effect"
import { AuthLive } from "../auth.js"
import { runEvolveCommand } from "./cmd/evolve.js"
import { runFinetuneCommand } from "./cmd/finetune.js"
import { runRefineCommand } from "./cmd/refine.js"
import { runAspireCommand } from "./cmd/aspire.js"
import { runAgentCommand } from "./cmd/agent.js"
import { runGraphCommand } from "./cmd/graph.js"
import { runGoalCommand } from "./cmd/goal.js"
import { runScheduleCommand } from "./cmd/schedule.js"
import { runHeartbeatCommand } from "./cmd/heartbeat.js"
import { runDaemonCommand } from "./cmd/daemon.js"
import { runSimCommand } from "./cmd/sim.js"
import { runVoiceCommand } from "./cmd/voice.js"
import { runMemoryCommand } from "./cmd/memory.js"
import { runOptimCommand } from "./cmd/optim.js"
import { runServeCommand } from "./cmd/serve.js"
import { runGuiBridge } from "./cmd/gui.js"
import { runSetupCommand } from "./cmd/setup.js"
import { runWebCommand } from "./cmd/web.js"
import { runModelsCommand } from "./cmd/models.js"

export async function dispatchCommand(cmd: string, args: string[]): Promise<boolean> {
  switch (cmd) {
    case "/evolve":
    case "evolve":
      await runEvolveCommand(args)
      return true
    case "/fine-tune":
    case "/finetune":
    case "fine-tune":
    case "finetune":
      runFinetuneCommand(args)
      return true
    case "/refine":
    case "refine":
      await runRefineCommand(args)
      return true
    case "/aspire":
    case "aspire":
      await runAspireCommand(args)
      return true
    case "/agent":
    case "agent":
      await runAgentCommand(args)
      return true
    case "/graph":
    case "graph":
      await runGraphCommand(args)
      return true
    case "/goal":
    case "goal":
      runGoalCommand(args)
      return true
    case "/schedule":
    case "schedule":
      runScheduleCommand(args)
      return true
    case "/heartbeat":
    case "heartbeat":
      await runHeartbeatCommand(args)
      return true
    case "/daemon":
    case "daemon":
      await runDaemonCommand(args)
      return true
    case "/sim":
    case "sim":
      await runSimCommand(args)
      return true
    case "/voice":
    case "voice":
      await runVoiceCommand(args)
      return true
    case "/memory":
    case "memory":
      await runMemoryCommand(args)
      return true
    case "/optim":
    case "optim":
      await runOptimCommand(args)
      return true
    case "/serve":
    case "serve":
      await runServeCommand(args)
      return true
    case "gui-bridge":
      await runGuiBridge(args)
      return true
    case "/setup":
    case "setup":
      await runSetupCommand(args)
      return true
    case "web":
      await runWebCommand(args)
      return true
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
      return true
    default:
      return false
  }
}
