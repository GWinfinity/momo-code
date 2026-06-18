/**
 * /evolve command — Experience fast loop (KEP)
 */
import { Effect } from "effect"
import {
  Evolve,
  type TaskCtx,
  CollectorLive,
  DistillerLive,
  SelectorLive,
  InjectorLive,
  SolidifyLive,
  GateLive,
  BridgeLive,
  ExperienceStoreLive,
  ExperienceGuardLive,
} from "../../experience/index.js"
import { SignalScorer } from "../../evolve/signals.js"

export function showEvolveHelp(): void {
  console.log(`
\x1b[1;36mmomo /evolve\x1b[0m — Experience fast loop (KEP)
5-step: Observe → Distill → Select → Solidify → Promote
USAGE:   momo /evolve [options]
OPTIONS: --mode=MODE  --inject  --solidify  --list  --help
  MODE = balanced (default) | explore | harden | convention-only
ENV:     MOMO_XP_MODE  MOMO_XP_DIR`)
}

function parseArgs(args: string[]) {
  const r = { mode: undefined as string | undefined, sessionId: `evo_${Date.now()}`, inject: false, solidify: false, list: false, help: false }
  for (const a of args) {
    if (a === "--help" || a === "-h") r.help = true
    else if (a.startsWith("--mode=")) r.mode = a.slice(7)
    else if (a.startsWith("--session-id=")) r.sessionId = a.slice(13)
    else if (a === "--inject") r.inject = true
    else if (a === "--solidify") r.solidify = true
    else if (a === "--list") r.list = true
  }
  return r
}

/** Providers for the experience pipeline */
const providers = [
  ExperienceStoreLive,
  GateLive,
  BridgeLive,
  ExperienceGuardLive,
]

/** Async entry — called by cli/index.ts via Effect.runPromise */
export async function runEvolveCommand(args: string[]): Promise<void> {
  const opts = parseArgs(args)

  if (opts.help) { showEvolveHelp(); return }

  if (opts.list) {
    console.log(`\n\x1b[1;36m📚 Learned Tactics\x1b[0m`)
    console.log(`  \x1b[90m~/.momo/experience/tactics.jsonl\x1b[0m`)
    console.log(`  Run \x1b[36mmomo /evolve\x1b[0m to learn.\n`)
    return
  }

  if (opts.inject) {
    console.log(`\n\x1b[1;36m💉 Tactic Injection\x1b[0m`)
    const { InjectForTask } = await import("../../experience/index.js")
    const ctx: TaskCtx = { id: opts.sessionId, description: "Injecting", signals: [SignalScorer.fromExitCode(0, "bash")] }
    const result = await Effect.runPromise(
      InjectForTask(ctx).pipe(Effect.provide(SelectorLive), Effect.provide(InjectorLive), Effect.provide(ExperienceStoreLive)),
    )
    console.log(result.tacticIds.length > 0
      ? `  \x1b[32m✓\x1b[0m ${result.tacticIds.length} tactics (~${result.estimatedTokens}t)\n`
      : `  \x1b[90mNo match\x1b[0m\n`)
    return
  }

  if (opts.solidify) {
    console.log(`\n\x1b[1;36m🧪 Solidify\x1b[0m`)
    const { SolidifyHook } = await import("../../experience/index.js")
    await Effect.runPromise(
      SolidifyHook(opts.sessionId, "pass", []).pipe(
        Effect.provide(SolidifyLive), Effect.provide(ExperienceStoreLive), Effect.provide(ExperienceGuardLive),
      ),
    )
    console.log(`  \x1b[32m✓\x1b[0m Stats updated\n`)
    return
  }

  // Full evolution loop
  console.log(`\n\x1b[1;36m🧬 momo Experience Evolution\x1b[0m   session: \x1b[90m${opts.sessionId}\x1b[0m`)
  const signals = [SignalScorer.fromExitCode(0, "bash"), SignalScorer.fromEdit(true)]
  const result = await Effect.runPromise(
    Evolve({ sessionId: opts.sessionId, signals, mode: (opts.mode as any) || "balanced" })
      .pipe(Effect.provide(ExperienceStoreLive), Effect.provide(DistillerLive), Effect.provide(CollectorLive), Effect.provide(GateLive), Effect.provide(BridgeLive), Effect.provide(ExperienceGuardLive)),
  )
  console.log(`  Tactics: \x1b[32m${result.tacticsCreated}\x1b[0m  Promoted: \x1b[35m${result.promoted}\x1b[0m  Verdict: ${result.verdict === "pass" ? "\x1b[32m✓\x1b[0m" : result.verdict === "fail" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m~\x1b[0m"}`)
  console.log(`  Storage: \x1b[90m~/.momo/experience/\x1b[0m\n`)
}
