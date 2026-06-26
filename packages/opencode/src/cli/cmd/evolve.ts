/**
 * /evolve command — Experience fast loop (KEP)
 *
 * 5-step: Observe → Distill → Select → Solidify → Promote
 * Sub-commands: --demo, --list, --signals, --observe, --solidify, --inject, --auto
 * Output flags: --json, --quiet
 */
import { Effect, Logger, LogLevel } from "effect"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { execSync } from "child_process"
import {
  Evolve,
  SolidifyHook,
  InjectForTask,
  Selector,
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
  ExperienceStore,
  winRate,
  thompsonSample,
  type Tactic,
  type TacticStatus,
} from "../../experience/index.js"
import {
  SignalScorer,
  scoreSessionQuality,
  type Signal,
  type SignalType,
  type Verdict,
} from "../../evolve/signals.js"

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface EvolveOpts {
  mode: string | undefined
  sessionId: string
  inject: string | false
  solidify: string[]
  list: boolean
  help: boolean
  demo: boolean
  signals: string | false
  observe: string[]
  json: boolean
  quiet: boolean
  auto: boolean
}

function parseArgs(args: string[]): EvolveOpts {
  const r: EvolveOpts = {
    mode: undefined,
    sessionId: `evo_${Date.now()}`,
    inject: false,
    solidify: [],
    list: false,
    help: false,
    demo: false,
    signals: false,
    observe: [],
    json: false,
    quiet: false,
    auto: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--help" || a === "-h") {
      r.help = true
    } else if (a.startsWith("--mode=")) {
      r.mode = a.slice(7)
    } else if (a.startsWith("--session-id=")) {
      r.sessionId = a.slice(13)
    } else if (a === "--inject") {
      r.inject = args[++i] || "Injecting"
    } else if (a === "--solidify") {
      const tacId = args[++i]
      const verdict = args[++i]
      if (tacId && verdict) {
        r.solidify = [tacId, verdict]
      }
    } else if (a === "--list") {
      r.list = true
    } else if (a === "--demo") {
      r.demo = true
    } else if (a === "--signals") {
      r.signals = args[++i] || ""
    } else if (a === "--observe") {
      const spec = args[++i]
      if (spec) r.observe.push(spec)
    } else if (a === "--json") {
      r.json = true
    } else if (a === "--quiet") {
      r.quiet = true
    } else if (a === "--auto") {
      r.auto = true
    }
  }
  return r
}

// ---------------------------------------------------------------------------
// --demo: synthetic signal generation
// ---------------------------------------------------------------------------

function generateDemoSignals(sessionId: string): Signal[] {
  const now = new Date()
  return [
    // 6 pass signals (grouped by toolName)
    { sessionId, timestamp: now, type: "test-pass", verdict: "pass", confidence: 0.95, metadata: { toolName: "bash", exitCode: 0, filePath: "src/auth.ts", language: "typescript" } },
    { sessionId, timestamp: now, type: "test-pass", verdict: "pass", confidence: 0.95, metadata: { toolName: "bash", exitCode: 0, filePath: "src/auth.ts", language: "typescript" } },
    { sessionId, timestamp: now, type: "edit-accepted", verdict: "pass", confidence: 0.9, metadata: { toolName: "edit", filePath: "src/auth.ts", language: "typescript" } },
    { sessionId, timestamp: now, type: "edit-accepted", verdict: "pass", confidence: 0.9, metadata: { toolName: "edit", filePath: "src/utils.ts", language: "typescript" } },
    { sessionId, timestamp: now, type: "test-pass", verdict: "pass", confidence: 0.95, metadata: { toolName: "bash", exitCode: 0, filePath: "test/auth.test.ts", language: "typescript" } },
    { sessionId, timestamp: now, type: "test-pass", verdict: "pass", confidence: 0.95, metadata: { toolName: "bash", exitCode: 0, filePath: "test/api.test.ts", language: "typescript" } },
    // 3 fail signals
    { sessionId, timestamp: now, type: "test-fail", verdict: "fail", confidence: 0.9, metadata: { toolName: "bash", exitCode: 1, filePath: "src/db.ts", language: "typescript", userMessage: "connection timeout" } },
    { sessionId, timestamp: now, type: "compile-error", verdict: "fail", confidence: 0.85, metadata: { toolName: "tsc", exitCode: 2, filePath: "src/index.ts", language: "typescript" } },
    { sessionId, timestamp: now, type: "retry-loop", verdict: "fail", confidence: 0.7, metadata: { toolName: "bash", retryCount: 4, filePath: "src/network.ts" } },
  ]
}

// ---------------------------------------------------------------------------
// --signals: load signals from JSONL file
// ---------------------------------------------------------------------------

function loadSignalsFromFile(filePath: string): Signal[] {
  const lines = fs.readFileSync(path.resolve(filePath), "utf-8").split("\n").filter((l) => l.trim())
  return lines.map((line) => {
    const obj = JSON.parse(line)
    return {
      ...obj,
      timestamp: new Date(obj.timestamp || Date.now()),
      verdict: (obj.verdict || "partial") as Verdict,
      confidence: obj.confidence || 0.9,
      metadata: obj.metadata || {},
    } as Signal
  })
}

// ---------------------------------------------------------------------------
// --observe: parse spec into Signal
// ---------------------------------------------------------------------------

function parseObserveSpec(spec: string): Signal {
  const parts = spec.split(":")
  const type = parts[0] as SignalType
  const toolName = parts[1] || undefined
  const filePath = parts[2] || undefined
  const userMessage = parts[3] || undefined

  const verdictMap: Record<string, Verdict> = {
    "test-pass": "pass",
    "edit-accepted": "pass",
    "test-fail": "fail",
    "compile-error": "fail",
    "lint-error": "fail",
    "edit-rejected": "fail",
    "user-correction": "fail",
    "post-hoc-edit": "fail",
    "retry-loop": "partial",
  }

  return {
    sessionId: "",
    timestamp: new Date(),
    type,
    verdict: verdictMap[type] || "partial",
    confidence: 0.9,
    metadata: { toolName, filePath, userMessage },
  }
}

// ---------------------------------------------------------------------------
// --auto: detect signals from cwd
// ---------------------------------------------------------------------------

function detectSignalsFromCwd(sessionId: string): Signal[] {
  const signals: Signal[] = []
  const cwd = process.cwd()

  // Check git status
  try {
    const gitDir = path.join(cwd, ".git")
    if (fs.existsSync(gitDir)) {
      try {
        const status = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 })
        if (status.trim().length > 0) {
          signals.push({
            sessionId,
            timestamp: new Date(),
            type: "edit-accepted",
            verdict: "pass",
            confidence: 0.8,
            metadata: { toolName: "git", filePath: cwd, language: "auto-detected" },
          })
        }
      } catch {
        // git status failed, ignore
      }
    }
  } catch {
    // fs or exec error
  }

  // Check package.json for test script
  try {
    const pkgPath = path.join(cwd, "package.json")
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
      if (pkg.scripts?.test) {
        signals.push({
          sessionId,
          timestamp: new Date(),
          type: "test-pass",
          verdict: "pass",
          confidence: 0.85,
          metadata: { toolName: "bash", exitCode: 0, filePath: pkgPath, language: "javascript" },
        })
      }
    }
  } catch {
    // ignore
  }

  // Check for tsconfig.json
  try {
    const tsconfigPath = path.join(cwd, "tsconfig.json")
    if (fs.existsSync(tsconfigPath)) {
      signals.push({
        sessionId,
        timestamp: new Date(),
        type: "test-pass",
        verdict: "pass",
        confidence: 0.8,
        metadata: { toolName: "tsc", exitCode: 0, filePath: tsconfigPath, language: "typescript" },
      })
    }
  } catch {
    // ignore
  }

  return signals
}

// ---------------------------------------------------------------------------
// --list: display tactics with Bayesian stats
// ---------------------------------------------------------------------------

function buildListOutput(tactics: Tactic[], json: boolean): string {
  if (json) {
    const grouped = {
      draft: tactics.filter((t) => t.status === "draft"),
      active: tactics.filter((t) => t.status === "active"),
      promoted: tactics.filter((t) => t.status === "promoted"),
      retired: tactics.filter((t) => t.status === "retired"),
    }
    const result: Record<string, unknown[]> = {}
    for (const [status, ts] of Object.entries(grouped)) {
      result[status] = ts.map((t) => ({
        id: t.id,
        title: t.title,
        scope: t.scope,
        intent: t.intent,
        winRate: winRate(t.stats),
        alpha: t.stats.alpha,
        beta: t.stats.beta,
        uses: t.stats.uses,
        thompsonSample: thompsonSample(t.stats),
      }))
    }
    return JSON.stringify(result, null, 2)
  }

  if (tactics.length === 0) {
    return `  \x1b[90mNo tactics stored yet.\x1b[0m\n  Run \x1b[36mmomo /evolve\x1b[0m to learn.\n`
  }

  const statuses: TacticStatus[] = ["draft", "active", "promoted", "retired"]
  const icons: Record<TacticStatus, string> = {
    draft: "\x1b[90m\u270E\x1b[0m",
    active: "\x1b[32m\u2713\x1b[0m",
    promoted: "\x1b[35m\u2605\x1b[0m",
    retired: "\x1b[90m\u2717\x1b[0m",
  }

  const lines: string[] = [`\n\x1b[1;36m\u{1F4DA} Learned Tactics\x1b[0m  \x1b[90m~/.momo/experience/tactics.json\x1b[0m\n`]

  for (const status of statuses) {
    const group = tactics.filter((t) => t.status === status)
    if (group.length === 0) continue

    lines.push(`  \x1b[1m${status.toUpperCase()}\x1b[0m (${group.length})`)
    for (const t of group) {
      const wr = winRate(t.stats)
      const ts = thompsonSample(t.stats)
      const wrColor = wr >= 0.75 ? "\x1b[32m" : wr >= 0.5 ? "\x1b[33m" : "\x1b[31m"
      lines.push(`    ${icons[status]} \x1b[90m${t.id}\x1b[0m  ${t.title}`)
      lines.push(`       \x1b[90mwinRate=${wrColor}${wr.toFixed(3)}\x1b[0m  \x1b[90m\u03b1=${t.stats.alpha} \u03b2=${t.stats.beta}\x1b[0m  \x1b[90muses=${t.stats.uses}\x1b[0m  \x1b[90mthompson=${ts.toFixed(3)}\x1b[0m`)
    }
    lines.push("")
  }

  lines.push(`  \x1b[90mTotal: ${tactics.length} tactics\x1b[0m\n`)
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Full evolution loop output builders
// ---------------------------------------------------------------------------

interface EvolveResult {
  sessionId: string
  tacticsCreated: number
  promoted: number
  verdict: string
  mode: string
}

function buildEvolveOutput(result: EvolveResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      sessionId: result.sessionId,
      tacticsCreated: result.tacticsCreated,
      promoted: result.promoted,
      verdict: result.verdict,
    })
  }
  const vd = result.verdict === "pass" ? "\x1b[32m\u2713\x1b[0m" : result.verdict === "fail" ? "\x1b[31m\u2717\x1b[0m" : "\x1b[33m~\x1b[0m"
  return `\n\x1b[1;36m\u{1F9EC} momo Experience Evolution\x1b[0m   session: \x1b[90m${result.sessionId}\x1b[0m (mode=${result.mode})\n  Tactics: \x1b[32m${result.tacticsCreated}\x1b[0m  Promoted: \x1b[35m${result.promoted}\x1b[0m  Verdict: ${vd}\n  Storage: \x1b[90m~/.momo/experience/\x1b[0m\n`
}

// ---------------------------------------------------------------------------
// Effect log-level helper — generic version
// ---------------------------------------------------------------------------

function applyQuiet<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return program.pipe(
    Logger.withMinimumLogLevel(LogLevel.Warning),
  ) as Effect.Effect<A, E, R>
}

// ---------------------------------------------------------------------------
// --inject: enhanced with Thompson scores
// ---------------------------------------------------------------------------

function buildInjectEnhancedOutput(
  result: { tacticIds: string[]; estimatedTokens: number },
  ranked: Array<{ id: string; title: string; thompsonScore: number }> | null,
  json: boolean,
): string {
  if (json) {
    const out: Record<string, unknown> = { tacticIds: result.tacticIds, estimatedTokens: result.estimatedTokens }
    if (ranked) {
      out.ranked = ranked.map((r) => ({ id: r.id, title: r.title, thompsonScore: r.thompsonScore }))
    }
    return JSON.stringify(out)
  }

  const lines: string[] = [`\n\x1b[1;36m\u{1F489} Tactic Injection\x1b[0m`]
  if (result.tacticIds.length === 0) {
    lines.push(`  \x1b[90mNo matching tactics found\x1b[0m\n`)
    return lines.join("\n")
  }
  lines.push(`  \x1b[32m\u2713\x1b[0m ${result.tacticIds.length} tactics (~${result.estimatedTokens}t)`)
  if (ranked && ranked.length > 0) {
    lines.push(`\n  \x1b[1mThompson ranking:\x1b[0m`)
    for (const r of ranked) {
      lines.push(`    \x1b[90m${r.id}\x1b[0m  score=\x1b[36m${r.thompsonScore.toFixed(3)}\x1b[0m  ${r.title}`)
    }
  }
  lines.push("")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// --solidify output builders
// ---------------------------------------------------------------------------

function buildSolidifyOutput(success: boolean, tacId: string, verdict: string, json: boolean): string {
  if (json) {
    return JSON.stringify({ tacticId: tacId, verdict, updated: success })
  }
  if (!success) {
    return `\n\x1b[1;36m\u{1F9EA} Solidify\x1b[0m\n  \x1b[31m\u2717\x1b[0m Failed to update \x1b[90m${tacId}\x1b[0m\n`
  }
  return `\n\x1b[1;36m\u{1F9EA} Solidify\x1b[0m\n  \x1b[32m\u2713\x1b[0m Stats updated for \x1b[90m${tacId}\x1b[0m  verdict=${verdict}\n`
}

// ---------------------------------------------------------------------------
// --auto output
// ---------------------------------------------------------------------------

function buildAutoOutput(signals: Signal[], json: boolean): string {
  if (json) {
    return JSON.stringify({ signalsDetected: signals.length, signals: signals.map((s) => ({ type: s.type, verdict: s.verdict, metadata: s.metadata })) })
  }
  if (signals.length === 0) {
    return `\n\x1b[1;36m\u{1F50D} Auto-detect\x1b[0m\n  \x1b[90mNo signals detected in current directory\x1b[0m\n`
  }
  const lines = [`\n\x1b[1;36m\u{1F50D} Auto-detect\x1b[0m  \x1b[90m${signals.length} signal(s) found\x1b[0m`]
  for (const s of signals) {
    lines.push(`  \x1b[32m\u2713\x1b[0m ${s.type}  ${s.metadata.toolName || ""}  ${s.metadata.filePath || ""}`)
  }
  lines.push("")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// --observe output
// ---------------------------------------------------------------------------

function buildObserveOutput(signals: Signal[], json: boolean): string {
  if (json) {
    return JSON.stringify({ signalsObserved: signals.length, signals: signals.map((s) => ({ type: s.type, verdict: s.verdict, metadata: s.metadata })) })
  }
  const lines = [`\n\x1b[1;36m\u{1F441} Observe\x1b[0m  \x1b[90m${signals.length} signal(s)\x1b[0m`]
  for (const s of signals) {
    const vColor = s.verdict === "pass" ? "\x1b[32m" : s.verdict === "fail" ? "\x1b[31m" : "\x1b[33m"
    lines.push(`  ${vColor}${s.verdict}\x1b[0m  ${s.type}  ${s.metadata.toolName || ""}  ${s.metadata.filePath || ""}`)
  }
  lines.push("")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

export function showEvolveHelp(): void {
  console.log(`
\x1b[1;36mmomo /evolve\x1b[0m — Experience fast loop (KEP)
5-step: Observe → Distill → Select → Solidify → Promote
USAGE:   momo /evolve [options]

OPTIONS:
  --mode=MODE         balanced (default) | explore | harden | convention-only
  --session-id=ID     Custom session identifier
  --demo              Run with 9 synthetic signals (6 pass + 3 fail)
  --list              List all tactics with Bayesian stats
  --signals=PATH      Load signals from JSONL file
  --observe=SPEC      Add signal (type[:tool[:filepath[:msg]]]); repeatable
  --solidify=TAC V    Solidify tactic (TAC=tactic-id, V=pass|fail|partial)
  --inject=DESC       Inject tactics for a task description
  --auto              Auto-detect signals from current directory
  --json              Output JSON format
  --quiet             Suppress INFO log output
  --help, -h          Show this help

ENV:     MOMO_XP_MODE  MOMO_XP_DIR`)
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runEvolveCommand(args: string[]): Promise<void> {
  const opts = parseArgs(args)

  if (opts.help) {
    showEvolveHelp()
    return
  }

  // ---- --list ---------------------------------------------------------------
  if (opts.list) {
    const listProgram = Effect.gen(function* () {
      const store = yield* ExperienceStore
      const tactics = yield* store.loadTactics()
      const output = buildListOutput([...tactics], opts.json)
      console.log(output)
    }).pipe(Effect.provide(ExperienceStoreLive))

    await Effect.runPromise(
      opts.quiet ? applyQuiet(listProgram) : listProgram,
    )
    return
  }

  // ---- --solidify ------------------------------------------------------------
  if (opts.solidify.length >= 2) {
    const [tacId, verdict] = opts.solidify
    if (!["pass", "fail", "partial"].includes(verdict)) {
      console.error(`\x1b[31mError: invalid verdict "${verdict}". Use pass|fail|partial\x1b[0m`)
      process.exit(1)
    }

    const solidifyProgram = SolidifyHook(
      opts.sessionId,
      verdict as "pass" | "fail" | "partial",
      [tacId],
    ).pipe(
      Effect.provide(SolidifyLive),
      Effect.provide(ExperienceStoreLive),
      Effect.provide(ExperienceGuardLive),
      Effect.matchEffect({
        onFailure: (err) =>
          Effect.sync(() => {
            console.log(buildSolidifyOutput(false, tacId, verdict, opts.json))
            console.error(`\x1b[31mError: ${err instanceof Error ? err.message : String(err)}\x1b[0m`)
          }),
        onSuccess: () =>
          Effect.sync(() => {
            console.log(buildSolidifyOutput(true, tacId, verdict, opts.json))
          }),
      }),
    )

    await Effect.runPromise(
      opts.quiet ? applyQuiet(solidifyProgram) : solidifyProgram,
    )
    return
  }

  // ---- --inject --------------------------------------------------------------
  if (opts.inject !== false) {
    const desc = typeof opts.inject === "string" ? opts.inject : "Injecting"
    const ctx: TaskCtx = {
      id: opts.sessionId,
      description: desc,
      signals: [SignalScorer.fromExitCode(0, "bash")],
    }

    const injectProgram = Effect.gen(function* () {
      const result = yield* InjectForTask(ctx).pipe(
        Effect.provide(SelectorLive),
        Effect.provide(InjectorLive),
        Effect.provide(ExperienceStoreLive),
      )

      // Try to get Thompson scores for display
      let ranked: Array<{ id: string; title: string; thompsonScore: number }> | null = null
      try {
        const selector = yield* Selector
        const taskContext = { signals: ctx.signals, repo: undefined, language: undefined }
        const candidates = yield* selector.retrieve(taskContext).pipe(
          Effect.orElse(() => Effect.succeed([] as Tactic[])),
        )
        if (candidates.length > 0) {
          const rankedResult = yield* selector.rankThompson(candidates, taskContext, { k: 6 })
          ranked = rankedResult.slice(0, 6).map((r) => ({
            id: r.tactic.id,
            title: r.tactic.title,
            thompsonScore: r.rawScore,
          }))
        }
      } catch {
        // ignore ranking errors
      }

      console.log(buildInjectEnhancedOutput(result, ranked, opts.json))
    }).pipe(
      Effect.provide(SelectorLive),
      Effect.provide(ExperienceStoreLive),
      Effect.catchAll((err: unknown) =>
        Effect.sync(() => {
          console.error(`\x1b[31mError: ${err instanceof Error ? err.message : String(err)}\x1b[0m`)
        }),
      ),
    )

    await Effect.runPromise(
      opts.quiet ? applyQuiet(injectProgram) : injectProgram,
    )
    return
  }

  // ---- --auto ----------------------------------------------------------------
  if (opts.auto) {
    const signals = detectSignalsFromCwd(opts.sessionId)
    console.log(buildAutoOutput(signals, opts.json))
    if (signals.length > 0) {
      const evolveProgram = Evolve({
        sessionId: opts.sessionId,
        signals,
        mode: (opts.mode as any) || "balanced",
      }).pipe(
        Effect.provide(ExperienceStoreLive),
        Effect.provide(DistillerLive),
        Effect.provide(CollectorLive),
        Effect.provide(GateLive),
        Effect.provide(BridgeLive),
        Effect.provide(ExperienceGuardLive),
      )

      const result = await Effect.runPromise(
        opts.quiet ? applyQuiet(evolveProgram) : evolveProgram,
      )
      console.log(buildEvolveOutput(
        { sessionId: opts.sessionId, mode: (opts.mode as any) || "balanced", tacticsCreated: result.tacticsCreated, promoted: result.promoted, verdict: result.verdict },
        opts.json,
      ))
    }
    return
  }

  // ---- --observe -------------------------------------------------------------
  if (opts.observe.length > 0) {
    const signals = opts.observe.map(parseObserveSpec)
    console.log(buildObserveOutput(signals, opts.json))

    const evolveProgram = Evolve({
      sessionId: opts.sessionId,
      signals,
      mode: (opts.mode as any) || "balanced",
    }).pipe(
      Effect.provide(ExperienceStoreLive),
      Effect.provide(DistillerLive),
      Effect.provide(CollectorLive),
      Effect.provide(GateLive),
      Effect.provide(BridgeLive),
      Effect.provide(ExperienceGuardLive),
    )

    const result = await Effect.runPromise(
      opts.quiet ? applyQuiet(evolveProgram) : evolveProgram,
    )
    console.log(buildEvolveOutput(
      { sessionId: opts.sessionId, mode: (opts.mode as any) || "balanced", tacticsCreated: result.tacticsCreated, promoted: result.promoted, verdict: result.verdict },
      opts.json,
    ))
    return
  }

  // ---- --demo ----------------------------------------------------------------
  if (opts.demo) {
    const signals = generateDemoSignals(opts.sessionId)
    const evolveProgram = Evolve({
      sessionId: opts.sessionId,
      signals,
      mode: (opts.mode as any) || "balanced",
    }).pipe(
      Effect.provide(ExperienceStoreLive),
      Effect.provide(DistillerLive),
      Effect.provide(CollectorLive),
      Effect.provide(GateLive),
      Effect.provide(BridgeLive),
      Effect.provide(ExperienceGuardLive),
    )

    const result = await Effect.runPromise(
      opts.quiet ? applyQuiet(evolveProgram) : evolveProgram,
    )
    console.log(buildEvolveOutput(
      { sessionId: opts.sessionId, mode: (opts.mode as any) || "balanced", tacticsCreated: result.tacticsCreated, promoted: result.promoted, verdict: result.verdict },
      opts.json,
    ))
    return
  }

  // ---- --signals (JSONL file) ------------------------------------------------
  if (opts.signals) {
    let signals: Signal[]
    try {
      signals = loadSignalsFromFile(opts.signals)
    } catch (err) {
      console.error(`\x1b[31mError reading signals file: ${err instanceof Error ? err.message : String(err)}\x1b[0m`)
      process.exit(1)
    }

    const evolveProgram = Evolve({
      sessionId: opts.sessionId,
      signals,
      mode: (opts.mode as any) || "balanced",
    }).pipe(
      Effect.provide(ExperienceStoreLive),
      Effect.provide(DistillerLive),
      Effect.provide(CollectorLive),
      Effect.provide(GateLive),
      Effect.provide(BridgeLive),
      Effect.provide(ExperienceGuardLive),
    )

    const result = await Effect.runPromise(
      opts.quiet ? applyQuiet(evolveProgram) : evolveProgram,
    )
    console.log(buildEvolveOutput(
      { sessionId: opts.sessionId, mode: (opts.mode as any) || "balanced", tacticsCreated: result.tacticsCreated, promoted: result.promoted, verdict: result.verdict },
      opts.json,
    ))
    return
  }

   // ---- Default: no input source given — show what to do ---------------------
  if (!opts.json) {
    console.log(`
\x1b[1;36m🧬 momo /evolve\x1b[0m

  No signal source specified. Pick one of:

  \x1b[36mmomo /evolve --demo\x1b[0m
      Run with 9 synthetic signals (6 pass + 3 fail) — best for first-time smoke test.

  \x1b[36mmomo /evolve --auto\x1b[0m
      Auto-detect signals from the current directory (git status, package.json).

  \x1b[36mmomo /evolve --signals path.jsonl\x1b[0m
      Load signals from a JSONL file (one Signal object per line).

  \x1b[36mmomo /evolve --observe test-pass:bash --observe edit-accepted::src/x.ts\x1b[0m
      Inline signal spec(s); repeat --observe to add more.

  \x1b[36mmomo /evolve --list\x1b[0m
      Print the current tactic library and Bayesian stats.

  See \x1b[36mmomo /evolve --help\x1b[0m for all options.
`)
    return
  }

  // JSON consumers still get a structured no-op result
  console.log(JSON.stringify({
    sessionId: opts.sessionId,
    tacticsCreated: 0,
    promoted: 0,
    verdict: "no-input",
    hint: "Use --demo, --auto, --signals, or --observe to provide signal input.",
  }))
}
