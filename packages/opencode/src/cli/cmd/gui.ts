/**
 * MOMO CODE — GUI bridge (stdio NDJSON).
 *
 * Spawned by the tinyjs desktop backend (desktop/src/backend/main.js) as a
 * sidecar process. stdin receives one JSON request per line; stdout emits one
 * JSON message per line:
 *
 *   request : {"id": number, "type": string, "payload": object}
 *   response: {"id": number, "type": "ok"|"error", "payload": object}
 *   event   : {"type": "event", "name": string, "sessionKey": string, "payload": object}
 *
 * Contract mirrors openclaude-ui's ElectronEvent surface so the renderer can
 * be reused with a thin shim.
 */
import * as readline from "readline"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { Effect, Logger, LogLevel } from "effect"
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
import { getCapture, recallMemory } from "../../memory/index.js"
import { chatComplete, resolveProviderConfig, type Usage } from "../chat.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BridgeRequest {
  id: number
  type: string
  payload: Record<string, unknown>
}

interface ChatMsg {
  role: "user" | "assistant"
  content: string
}

interface ProviderConfig {
  providerId: string
  apiKey: string
  baseUrl: string
  model: string
}

interface GuiModelEntry {
  id: string
  name: string
  model: string
  apiKey: string
  baseUrl: string
}

interface GuiConfig {
  activeModelRef?: string
  providers?: Record<string, { models?: GuiModelEntry[] }>
  proxy?: { enabled?: boolean; url?: string; bypass?: string }
  jev?: { provider?: string; model?: string; baseUrl?: string; apiKey?: string; mode?: string }
}

// ---------------------------------------------------------------------------
// Provider catalog (mirrors openclaude-ui's main.cjs)
// ---------------------------------------------------------------------------

const PROVIDER_DEFS: Record<string, { name: string; envKeys: string[]; baseUrl: string; defaultModel: string }> = {
  anthropic: { name: "Anthropic Claude", envKeys: ["ANTHROPIC_API_KEY"], baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-6" },
  openai: { name: "OpenAI", envKeys: ["OPENAI_API_KEY"], baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o" },
  gemini: { name: "Google Gemini", envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.0-flash" },
  custom: { name: "自定义", envKeys: [], baseUrl: "", defaultModel: "" },
}

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
  gemini: ["gemini-2.0-flash", "gemini-2.0-pro-exp", "gemini-1.5-pro", "gemini-1.5-flash"],
  custom: [],
}

// ---------------------------------------------------------------------------
// GUI config: ~/.momo/gui.json
// ---------------------------------------------------------------------------

function guiConfigPath(): string {
  return path.join(os.homedir(), ".momo", "gui.json")
}

function readGuiConfig(): GuiConfig {
  try {
    return JSON.parse(fs.readFileSync(guiConfigPath(), "utf-8")) as GuiConfig
  } catch {
    return {}
  }
}

function writeGuiConfig(cfg: GuiConfig): void {
  const p = guiConfigPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf-8")
}

interface AllModel {
  ref: string
  alias: string
  model: string
  providerId: string
  providerName: string
}

function buildAllModels(cfg: GuiConfig): AllModel[] {
  const list: AllModel[] = []
  for (const [id, prov] of Object.entries(cfg.providers || {})) {
    const def = PROVIDER_DEFS[id]
    for (const m of prov.models || []) {
      if (!m.apiKey && id !== "ollama") continue
      list.push({
        ref: `${id}:${m.id}`,
        alias: m.name || m.model,
        model: m.model,
        providerId: id,
        providerName: def?.name || id,
      })
    }
  }
  return list
}

function resolveModelRef(cfg: GuiConfig, ref: string): ProviderConfig | null {
  if (!ref) return null
  const colon = ref.indexOf(":")
  if (colon < 0) return null
  const provId = ref.slice(0, colon)
  const modelId = ref.slice(colon + 1)
  const entry = cfg.providers?.[provId]?.models?.find((m) => m.id === modelId)
  if (!entry) return null
  return {
    providerId: provId,
    apiKey: entry.apiKey || "",
    baseUrl: entry.baseUrl || PROVIDER_DEFS[provId]?.baseUrl || "",
    model: entry.model,
  }
}

// ---------------------------------------------------------------------------
// System prompt (mirrors repl.ts injection)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are MOMO CODE, an AI coding assistant.
- Provide concise, actionable responses
- Use code blocks with language tags
- Ask clarifying questions when requirements are ambiguous
- Prefer modern best practices
- Consider security implications`

async function buildSystemPrompt(): Promise<string> {
  let systemPrompt = SYSTEM_PROMPT
  try {
    const result = await Effect.runPromise(
      InjectForTask({
        id: `gui_${Date.now()}`,
        description: "desktop gui session",
        signals: [SignalScorer.fromExitCode(0, "bash")],
      }).pipe(
        // The Effect logger writes to stdout — mute it, stdout is protocol-only.
        Logger.withMinimumLogLevel(LogLevel.None),
        Effect.provide(SelectorLive),
        Effect.provide(InjectorLive),
        Effect.provide(ExperienceStoreLive),
      ),
    )
    if (result.block && result.block.length > 0) {
      systemPrompt += "\n\n---\n\n" + result.block
    }
  } catch {
    /* best-effort */
  }
  try {
    const patchPath = getPromptPatchPath()
    if (fs.existsSync(patchPath)) {
      const patch = fs.readFileSync(patchPath, "utf-8").trim()
      if (patch) systemPrompt += "\n\n---\n\n## Refined Behavior\n" + patch
    }
  } catch {
    /* best-effort */
  }
  try {
    const goalsBlock = activeGoalsBlock()
    if (goalsBlock) systemPrompt += "\n\n---\n\n" + goalsBlock
  } catch {
    /* best-effort */
  }
  try {
    const memBlock = await recallMemory("desktop gui session")
    if (memBlock) systemPrompt += "\n\n---\n\n" + memBlock
  } catch {
    /* best-effort */
  }
  return systemPrompt
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function emit(msg: Record<string, unknown>): void {
  // Deliberately bypasses the redirected process.stdout.write (set up in
  // runGuiBridge) — this is the one channel reserved for the protocol.
  realStdoutWrite(JSON.stringify(msg) + "\n")
}

function reply(id: number, payload: Record<string, unknown>): void {
  emit({ id, type: "ok", payload })
}

function replyError(id: number, message: string): void {
  emit({ id, type: "error", payload: { message } })
}

function pushEvent(name: string, sessionKey: string, payload: Record<string, unknown>): void {
  emit({ type: "event", name, sessionKey, payload })
}

/** The real stdout write, kept aside before runGuiBridge redirects it. */
const realStdoutWrite: (chunk: string) => boolean = (
  process.stdout.write.bind(process.stdout) as (chunk: string) => boolean
)

// ---------------------------------------------------------------------------
// Chat sessions
// ---------------------------------------------------------------------------

interface ChatSession {
  controller: AbortController
  history: ChatMsg[]
  running: boolean
}

const sessions = new Map<string, ChatSession>()

async function handleChatSend(payload: Record<string, unknown>, id: number): Promise<void> {
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : "default"
  const message = typeof payload.message === "string" ? payload.message : ""
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : os.homedir()
  const history = Array.isArray(payload.history) ? (payload.history as ChatMsg[]) : []

  if (!message) {
    replyError(id, "message is required")
    return
  }

  // Rebuild the session so history stays authoritative from the renderer.
  sessions.get(sessionKey)?.controller.abort()
  const session: ChatSession = { controller: new AbortController(), history: [...history], running: true }
  sessions.set(sessionKey, session)

  // Provider: explicit config from GUI wins; then the GUI's saved active model;
  // momo's own config is the last resort.
  const guiProvider = (payload.providerConfig ?? null) as ProviderConfig | null
  const guiCfg = readGuiConfig()
  const savedActive = guiCfg.activeModelRef ? resolveModelRef(guiCfg, guiCfg.activeModelRef) : null
  const fallback = await resolveProviderConfig()
  const resolved = guiProvider && guiProvider.model ? guiProvider : savedActive || fallback
  const providerName = guiProvider && guiProvider.model
    ? guiProvider.providerId
    : savedActive
      ? savedActive.providerId
      : fallback?.providerName ?? ""
  if (!resolved) {
    pushEvent("chat:error", sessionKey, { message: "未配置模型，请先在\"设置 → 提供商与模型\"中添加并选择一个模型。" })
    reply(id, { ok: true })
    return
  }

  session.history.push({ role: "user", content: message })
  reply(id, { ok: true })

  const usageSink: Usage[] = []
  const startMs = Date.now()
  let inThinking = false
  const system = await buildSystemPrompt()

  const closeThinking = () => {
    if (inThinking) {
      inThinking = false
      pushEvent("chat:thinking-end", sessionKey, {})
    }
  }

  try {
    const response = await chatComplete({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system,
      messages: session.history.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: 0.7,
      quiet: true,
      signal: session.controller.signal,
      onToken: (chunk) => {
        closeThinking()
        pushEvent("chat:chunk", sessionKey, { text: chunk })
      },
      onReasoning: (chunk) => {
        if (!inThinking) {
          inThinking = true
          pushEvent("chat:thinking-start", sessionKey, {})
        }
        pushEvent("chat:thinking-chunk", sessionKey, { text: chunk })
      },
      onUsage: (u) => usageSink.push(u),
    })
    closeThinking()
    session.history.push({ role: "assistant", content: response })

    const usage = usageSink[usageSink.length - 1]
    pushEvent("chat:done", sessionKey, {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
    })

    recordSession({
      provider: providerName || resolved.baseUrl,
      model: resolved.model,
      prompt: message,
      response,
      exitCode: 0,
      durationMs: Date.now() - startMs,
      rlmDepth: 0,
    }).catch(() => {})

    // Passive memory write-back (Hy-Memory, throttled, best-effort)
    try {
      const capture = getCapture(sessionKey)
      if (capture) {
        capture.addTurn(message, response)
        void capture.maybeFlush()
      }
    } catch {
      /* best-effort */
    }
  } catch (err) {
    closeThinking()
    const msg = err instanceof Error ? err.message : String(err)
    if (!session.controller.signal.aborted) {
      pushEvent("chat:error", sessionKey, { message: msg })
    }
  } finally {
    session.running = false
    if (sessions.get(sessionKey) === session) sessions.delete(sessionKey)
  }
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(req: BridgeRequest): Promise<void> {
  const { id, type, payload = {} } = req
  switch (type) {
    case "ping":
      reply(id, { ok: true, version: "0.1.0" })
      return

    case "config.get": {
      const cfg = readGuiConfig()
      const allModels = buildAllModels(cfg)
      reply(id, {
        hasModels: allModels.length > 0,
        platform: process.platform,
        homeDir: os.homedir(),
        configDir: path.join(os.homedir(), ".momo"),
        activeModelRef: cfg.activeModelRef || allModels[0]?.ref || null,
        allModels,
        providers: cfg.providers || {},
        proxy: cfg.proxy || { enabled: false, url: "", bypass: "" },
        jev: cfg.jev || {},
        PROVIDER_DEFS,
        PROVIDER_MODELS,
      })
      return
    }

    case "config.saveProviderSettings": {
      const cfg = readGuiConfig()
      if (payload.providers !== undefined) cfg.providers = payload.providers as GuiConfig["providers"]
      if (payload.activeModelRef !== undefined) cfg.activeModelRef = payload.activeModelRef as string
      if (payload.proxy !== undefined) cfg.proxy = payload.proxy as GuiConfig["proxy"]
      if (payload.jev !== undefined) cfg.jev = payload.jev as GuiConfig["jev"]
      writeGuiConfig(cfg)
      const allModels = buildAllModels(cfg)
      reply(id, { ok: true, allModels, activeModelRef: cfg.activeModelRef || allModels[0]?.ref || null })
      return
    }

    case "config.setActiveModel": {
      const cfg = readGuiConfig()
      cfg.activeModelRef = String(payload.ref || "")
      writeGuiConfig(cfg)
      reply(id, { ok: true })
      return
    }

    case "chat.send":
      await handleChatSend(payload, id)
      return

    case "chat.cancel": {
      const sessionKey = String(payload.sessionKey || "default")
      const session = sessions.get(sessionKey)
      if (session) {
        session.controller.abort()
        sessions.delete(sessionKey)
      }
      reply(id, { ok: true })
      return
    }

    case "chat.newSession": {
      const sessionKey = String(payload.sessionKey || "default")
      const session = sessions.get(sessionKey)
      if (session) {
        session.controller.abort()
        sessions.delete(sessionKey)
      }
      reply(id, { ok: true })
      return
    }

    default:
      replyError(id, `unknown request type: ${type}`)
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function runGuiBridge(_args: string[]): Promise<void> {
  // stdout is the protocol channel — never write anything else to it.
  // The Effect logger writes straight to process.stdout.write (bypassing
  // console), so redirect it to stderr; emit() uses the saved realStdoutWrite.
  process.env.EFFECT_LOG_LEVEL = "NONE"
  process.stdout.write = ((chunk: string) => {
    try {
      process.stderr.write(chunk)
    } catch {
      /* ignore */
    }
    return true
  }) as typeof process.stdout.write
  console.log = (...args: unknown[]) => console.error(...args)
  console.info = (...args: unknown[]) => console.error(...args)
  console.warn = (...args: unknown[]) => console.error(...args)

  const rl = readline.createInterface({ input: process.stdin, terminal: false })
  realStdoutWrite(
    JSON.stringify({
      type: "event",
      name: "bridge:ready",
      sessionKey: "",
      payload: { pid: process.pid },
    }) + "\n",
  )

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let req: BridgeRequest
    try {
      req = JSON.parse(trimmed) as BridgeRequest
    } catch {
      continue
    }
    // Not awaited: chat.send streams while later requests (e.g. chat.cancel) run.
    void handleRequest(req).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (typeof req.id === "number") replyError(req.id, msg)
    })
  }

  for (const session of sessions.values()) session.controller.abort()
  process.exit(0)
}
