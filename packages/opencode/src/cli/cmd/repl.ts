/**
 * MOMO CODE — Interactive REPL mode.
 *
 *   momo          (no arguments)
 *   momo repl
 *
 * Multi-turn conversation with history, readline editing, and Ctrl+C to exit.
 */
import * as readline from "readline"
import { Effect } from "effect"
import {
  InjectForTask,
  SelectorLive,
  InjectorLive,
  ExperienceStoreLive,
} from "../../experience/index.js"
import { SignalScorer } from "../../evolve/signals.js"
import { getPromptPatchPath } from "../../refine/apply.js"
import { activeGoalsBlock } from "../../goal/store.js"
import { recordSession } from "../../session/recorder.js"
import { resolveProviderConfig, chatComplete, type Usage } from "../chat.js"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const MAGENTA = "\x1b[95m"
const YELLOW = "\x1b[33m"

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are MOMO CODE, an AI coding assistant.
- Provide concise, actionable responses
- Use code blocks with language tags
- Ask clarifying questions when requirements are ambiguous
- Prefer modern best practices
- Consider security implications`

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

interface ChatMsg {
  role: "user" | "assistant"
  content: string
}

/**
 * Run the interactive REPL.
 * Returns exit code.
 */
export async function runRepl(): Promise<number> {
  // Resolve provider config
  const config = await resolveProviderConfig()
  if (!config) {
    console.error(`${RESET}`)
    console.error(`${MAGENTA}MOMO CODE${RESET}: No API key configured.\n`)
    console.error(`${GREEN}Quick fix — run the setup wizard:${RESET}`)
    console.error(`  ${CYAN}momo /setup${RESET}\n`)
    console.error(`Or configure manually:`)
    console.error(`  ${CYAN}MOMO_API_KEY${RESET}              Generic key (works with any provider)`)
    console.error(`  ${CYAN}~/.momo/momo.jsonc${RESET}           Config file (persistent)`)
    return 1
  }

  // Build system prompt with tactic injection
  let systemPrompt = SYSTEM_PROMPT
  try {
    const result = await Effect.runPromise(
      InjectForTask({
        id: `repl_${Date.now()}`,
        description: "interactive session",
        signals: [SignalScorer.fromExitCode(0, "bash")],
      }).pipe(
        Effect.provide(SelectorLive),
        Effect.provide(InjectorLive),
        Effect.provide(ExperienceStoreLive),
      ),
    )
    if (result.block && result.block.length > 0) {
      systemPrompt += "\n\n---\n\n" + result.block
    }
  } catch { /* best-effort */ }

  // Inject /refine patches
  try {
    const patchPath = getPromptPatchPath()
    if (fs.existsSync(patchPath)) {
      const patch = fs.readFileSync(patchPath, "utf-8").trim()
      if (patch) systemPrompt += "\n\n---\n\n## Refined Behavior\n" + patch
    }
  } catch { /* best-effort */ }

  // Inject goals
  try {
    const goalsBlock = activeGoalsBlock()
    if (goalsBlock) systemPrompt += "\n\n---\n\n" + goalsBlock
  } catch { /* best-effort */ }

  // Print header
  console.log()
  console.log(`${MAGENTA}${BOLD}  MOMO CODE${RESET} — Interactive Mode`)
  console.log(`${DIM}  → ${config.providerName} | ${config.model}${RESET}`)
  console.log(`${DIM}  Type your message and press Enter. Ctrl+C to exit.${RESET}`)
  console.log()

  const history: ChatMsg[] = []

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${CYAN}> ${RESET}`,
    // Enable graceful Ctrl+C
    terminal: true,
  })

  // Handle Ctrl+C gracefully
  let exiting = false
  rl.on("SIGINT", () => {
    if (exiting) {
      process.exit(0)
    }
    exiting = true
    console.log(`\n${DIM}  (Ctrl+C again to exit, or type a message to continue)${RESET}`)
    rl.prompt()
    setTimeout(() => { exiting = false }, 2000)
  })

  rl.prompt()

  return new Promise<number>((resolve) => {
    rl.on("line", async (line: string) => {
      const input = line.trim()
      if (!input) {
        rl.prompt()
        return
      }

      // Special commands
      if (input === "/clear" || input === "/cls") {
        history.length = 0
        console.clear()
        console.log(`${DIM}  History cleared.${RESET}\n`)
        rl.prompt()
        return
      }
      if (input === "/help") {
        console.log(`\n${BOLD}  Commands:${RESET}`)
        console.log(`    ${CYAN}/clear${RESET}  Clear conversation history`)
        console.log(`    ${CYAN}/history${RESET} Show message count`)
        console.log(`    ${CYAN}/setup${RESET}  Re-run setup wizard`)
        console.log(`    ${CYAN}/web${RESET}    Open web dashboard`)
        console.log(`    ${CYAN}/exit${RESET}   Exit REPL\n`)
        rl.prompt()
        return
      }
      if (input === "/history") {
        console.log(`\n${DIM}  ${history.length} messages in history.${RESET}\n`)
        rl.prompt()
        return
      }
      if (input === "/exit" || input === "/quit") {
        console.log(`\n${DIM}  Bye!${RESET}\n`)
        rl.close()
        resolve(0)
        return
      }

      // Add to history
      history.push({ role: "user", content: input })

      // Call the model
      const startMs = Date.now()
      const usageSink: Usage[] = []
      try {
        const response = await chatComplete({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          system: systemPrompt,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          temperature: 0.7,
          onUsage: (u) => usageSink.push(u),
        })

        history.push({ role: "assistant", content: response })

        // Record trajectory
        await recordSession({
          provider: config.providerName,
          model: config.model,
          prompt: input,
          response,
          exitCode: 0,
          durationMs: Date.now() - startMs,
          rlmDepth: 0,
        }).catch(() => {})
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`\n${MAGENTA}MOMO CODE${RESET} Error: ${msg}`)
        if (msg.includes("401") || msg.includes("403")) {
          console.error(`${DIM}Hint: Check your API key. Run ${CYAN}momo /setup${DIM} to reconfigure.${RESET}`)
        }
      }

      console.log()
      rl.prompt()
    })

    rl.on("close", () => {
      resolve(0)
    })
  })
}
