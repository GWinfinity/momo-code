// SPDX-License-Identifier: MIT
// momo REPL — Main Entry
// Pi-based interactive agent with momo extensions

import readline from "readline"
import { setupKeyboardHandlers, restoreTerminal } from "./keyboard.js"
import { CoTRenderer } from "./cot-renderer.js"
import { renderDecisionBar, renderEvidenceBar } from "./decision-capsule.js"

export interface ReplOptions {
  initialPrompt?: string
  printMode?: boolean
  jsonMode?: boolean
}

export async function startRepl(opts: ReplOptions = {}): Promise<void> {
  const cot = new CoTRenderer()

  // Setup keyboard shortcuts
  setupKeyboardHandlers({
    "\x14": () => cot.toggle(), // ⌃T
    "\x0f": () => {
      process.stderr.write("\n[Tools toggled]\n") // ⌃O
    },
    "\x03": () => {
      restoreTerminal()
      process.exit(0)
    },
  })

  // Ensure cleanup on exit
  process.on("exit", restoreTerminal)
  process.on("SIGINT", () => {
    restoreTerminal()
    process.exit(0)
  })

  if (opts.printMode) {
    // Print mode: no TTY, no REPL, just execute and exit
    await runSingleTask(opts.initialPrompt || "", { cot, silent: true })
    restoreTerminal()
    return
  }

  if (opts.jsonMode) {
    // JSONL mode: output structured events
    await runJsonMode(opts.initialPrompt || "")
    restoreTerminal()
    return
  }

  // Interactive REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  })

  // Show initial banner (Pi extension will show its own, but momo adds flair)
  if (process.stdout.isTTY && !opts.initialPrompt) {
    process.stderr.write("🚀 momo v2.0 — Type /help for commands, /exit to quit\n\n")
  }

  // If initial prompt provided, run it first
  if (opts.initialPrompt) {
    await runSingleTask(opts.initialPrompt, { cot, silent: false })
  }

  // REPL loop
  rl.prompt()

  rl.on("line", async (line) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    // Meta commands
    if (input === "/exit" || input === "/quit") {
      rl.close()
      return
    }
    if (input === "/help") {
      showHelp()
      rl.prompt()
      return
    }
    if (input === "/cot") {
      cot.toggle()
      rl.prompt()
      return
    }

    // Run task
    await runSingleTask(input, { cot, silent: false })
    rl.prompt()
  })

  rl.on("close", () => {
    restoreTerminal()
    process.stderr.write("\n👋 Bye!\n")
    process.exit(0)
  })
}

// ── Task execution ────────────────────────────────────────────────

async function runSingleTask(
  prompt: string,
  opts: { cot: CoTRenderer; silent: boolean },
): Promise<void> {
  const { cot } = opts

  cot.start()

  // In production: call Pi agent here
  // For now: placeholder that shows the flow
  if (!opts.silent) {
    console.log(`\n🤔 Processing: "${prompt}"\n`)
  }

  // Simulate thinking steps
  cot.addStep({ number: 1, action: "分析用户意图", detail: "识别为编码任务" })
  await sleep(200)
  cot.addStep({ number: 2, action: "检索经验战术", detail: "找到 2 条相关 tactic" })
  await sleep(200)
  cot.addStep({ number: 3, action: "选择工具链", detail: "read → think → write" })
  await sleep(200)

  cot.finish()

  // Show decision capsules (P4 JEV)
  if (!opts.silent && process.env.MOMO_UI_DECISION_CHIPS === "true") {
    renderDecisionBar([
      { gate: "tactic", confidence: 0.82, latencyMs: 11, action: "pass", reason: "匹配成功" },
      { gate: "tool", confidence: 0.91, latencyMs: 8, action: "pass", reason: "标准操作" },
    ])
  }

  // Show evidence bar (P2 Experience)
  if (!opts.silent && process.env.MOMO_UI_EVIDENCE_BAR === "true") {
    renderEvidenceBar([
      { name: "ts-strict-null", winRate: 0.82, alpha: 41, beta: 9, verdict: "pass" },
    ])
  }

  // Simulated response
  if (!opts.silent) {
    console.log("✅ 任务处理完成（Pi 运行时未安装，显示模拟输出）")
    console.log("   安装 Pi: npm install @earendil-works/pi-coding-agent@1.4.0")
  }
}

async function runJsonMode(prompt: string): Promise<void> {
  // JSONL event stream
  const events = [
    { type: "session_start", timestamp: Date.now() },
    { type: "thinking", step: 1, content: "分析用户意图" },
    { type: "thinking", step: 2, content: "检索经验战术" },
    { type: "tool_call", tool: "read", path: "/tmp/test.ts" },
    { type: "tool_result", tool: "read", exitCode: 0 },
    { type: "completion", content: "任务完成" },
    { type: "session_end", timestamp: Date.now() },
  ]

  for (const event of events) {
    console.log(JSON.stringify(event))
    await sleep(100)
  }
}

function showHelp(): void {
  process.stderr.write(`
Commands:
  /help        Show this help
  /exit        Exit REPL
  /cot         Toggle CoT display

Keyboard:
  ⌃T           Toggle thinking chain
  ⌃O           Toggle tool details
  ⌃C           Interrupt / exit

Environment:
  MOMO_API_KEY                  API key
  MOMO_PROVIDER                 Provider (openai/anthropic/...)
  MOMO_MODEL                    Model or tier (ultra/standard/lite)
  MOMO_UI_DECISION_CHIPS=true   Show decision capsules
  MOMO_UI_EVIDENCE_BAR=true     Show evidence bar
`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── CLI entry (when run directly via tsx) ─────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "repl"
  const prompt = process.argv.slice(3).join(" ")
  startRepl({
    initialPrompt: prompt || undefined,
    printMode: mode === "print",
    jsonMode: mode === "json",
  }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
