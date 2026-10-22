// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: config resolution.
// Priority: MOMO_MEMORY_* env > momo.jsonc `memory` block > defaults.

import fs from "fs"
import os from "os"
import path from "path"
import { getConfigFilePath } from "../config/config.js"
import type {
  MemoryConfig,
  MemoryEmbedderConfig,
  MemoryLlmConfig,
  MemoryUserConfig,
  MemoryVectorStoreConfig,
} from "./types.js"

const DEFAULT_SERVER_PORT = 19527
const DEFAULT_MODE = "pro"
const MEMORY_MODES = ["lite", "pro", "ultra"] as const

/** Hy-Memory server home (venv + default data dir), shared with other agents. */
export function getHyMemoryHome(): string {
  return process.env.HY_MEMORY_HOME?.trim() || path.join(os.homedir(), ".hy-memory")
}

/** Load the `memory` block from momo.jsonc (best-effort, never throws). */
export function loadMemoryUserConfig(): MemoryUserConfig {
  try {
    const configPath = getConfigFilePath()
    if (!fs.existsSync(configPath)) return {}
    const content = fs.readFileSync(configPath, "utf-8")
    const stripped = content
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
    const parsed = JSON.parse(stripped) as { memory?: MemoryUserConfig }
    return parsed.memory && typeof parsed.memory === "object" ? parsed.memory : {}
  } catch {
    return {}
  }
}

function envStr(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function envNum(name: string): number | undefined {
  const v = envStr(name)
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

function pickStr(envName: string, user: string | undefined, dflt: string): string {
  return envStr(envName) ?? (user && user.trim() ? user : dflt)
}

function pickNum(envName: string, user: number | undefined, dflt: number): number {
  return envNum(envName) ?? (typeof user === "number" && !Number.isNaN(user) ? user : dflt)
}

function pickBool(user: boolean | undefined, dflt: boolean): boolean {
  return typeof user === "boolean" ? user : dflt
}

function pickMode(user: string | undefined): MemoryConfig["mode"] {
  const raw = envStr("MOMO_MEMORY_MODE") ?? user ?? DEFAULT_MODE
  const mode = raw.toLowerCase().trim()
  return (MEMORY_MODES as readonly string[]).includes(mode)
    ? (mode as MemoryConfig["mode"])
    : DEFAULT_MODE
}

/** Global kill switch: MOMO_MEMORY=0/false/no disables every memory feature. */
export function isMemoryEnabled(): boolean {
  const raw = envStr("MOMO_MEMORY")
  if (raw === undefined) return true
  return !(raw === "0" || raw.toLowerCase() === "false" || raw.toLowerCase() === "no")
}

/**
 * Resolve the effective memory config.
 * Order: MOMO_MEMORY_* env > momo.jsonc `memory` block > defaults.
 */
export function resolveMemoryConfig(user?: MemoryUserConfig): MemoryConfig {
  const u = user ?? loadMemoryUserConfig()
  const serverPort = pickNum("MOMO_MEMORY_SERVER_PORT", u.serverPort, DEFAULT_SERVER_PORT)
  return {
    enabled: isMemoryEnabled(),
    userId: pickStr("MOMO_MEMORY_USER_ID", u.userId, defaultUserId()),
    agentId: pickStr("MOMO_MEMORY_AGENT_ID", u.agentId, "momo"),
    sessionId: pickStr("MOMO_MEMORY_SESSION_ID", u.sessionId, "default_session"),
    mode: pickMode(u.mode),
    serverUrl: pickStr("MOMO_MEMORY_SERVER_URL", u.serverUrl, `http://127.0.0.1:${serverPort}`),
    serverPort,
    autoStartServer: pickBool(u.autoStartServer, true),
    autoRecall: pickBool(u.autoRecall, true),
    autoCapture: pickBool(u.autoCapture, true),
    memoryWriteTurnWindow: Math.max(1, pickNum("MOMO_MEMORY_WRITE_TURN_WINDOW", u.memoryWriteTurnWindow, 5)),
    topK: pickNum("MOMO_MEMORY_TOP_K", u.topK, 5),
    searchThreshold: pickNum("MOMO_MEMORY_SEARCH_THRESHOLD", u.searchThreshold, 0.3),
    profileLimit: pickNum("MOMO_MEMORY_PROFILE_LIMIT", u.profileLimit, 5),
    profileMinScore: pickNum("MOMO_MEMORY_PROFILE_MIN_SCORE", u.profileMinScore, 0.4),
    pythonPath: pickStr("MOMO_MEMORY_PYTHON", u.pythonPath, process.platform === "win32" ? "python" : "python3"),
    llm: u.llm,
    embedder: u.embedder,
    vectorStore: u.vectorStore,
  }
}

/** Memory write-back session id for a fresh conversation. */
export function newMemorySessionId(): string {
  return process.env.MOMO_MEMORY_SESSION_ID?.trim() || `mem_${Date.now()}`
}

function defaultUserId(): string {
  try {
    return os.userInfo().username || "default"
  } catch {
    return "default"
  }
}

/**
 * Build the server process env from config (mirrors the official
 * `opencode-hy-memory` plugin's `buildServerEnv`).
 */
export function buildServerEnv(cfg: MemoryConfig): Record<string, string> {
  const env: Record<string, string> = {}
  env.MEMORY_DATA_DIR = path.join(getHyMemoryHome(), "db")
  env.MEMORY_MODE = cfg.mode
  if (cfg.mode === "ultra") env.MEMORY_GRAPH_PROVIDER = "kuzu"
  env.MEMORY_ENABLE_SEARCH_QUERY = "false"
  env.MEMORY_CACHE_BACKEND = "sqlite"
  env.MEMORY_PIPELINE_TRACE_ENABLED = "false"
  const llm: MemoryLlmConfig | undefined = cfg.llm
  if (llm) {
    if (llm.provider) env.MEMORY_LLM_PROVIDER = llm.provider
    if (llm.model) env.MEMORY_LLM_MODEL = llm.model
    if (llm.apiKey) env.MEMORY_LLM_API_KEY = llm.apiKey
    if (llm.baseUrl) env.MEMORY_LLM_BASE_URL = llm.baseUrl
    if (llm.temperature != null) env.MEMORY_LLM_TEMPERATURE = String(llm.temperature)
    if (llm.maxTokens != null) env.MEMORY_LLM_MAX_TOKENS = String(llm.maxTokens)
    if (llm.thinkingMode) env.HY_MEMORY_THINKING_MODE = llm.thinkingMode
  }
  const embedder: MemoryEmbedderConfig | undefined = cfg.embedder
  if (embedder) {
    if (embedder.provider) env.MEMORY_EMBEDDER_PROVIDER = embedder.provider
    if (embedder.model) env.MEMORY_EMBEDDER_MODEL = embedder.model
    if (embedder.apiKey) env.MEMORY_EMBEDDER_API_KEY = embedder.apiKey
    if (embedder.baseUrl) env.MEMORY_EMBEDDER_BASE_URL = embedder.baseUrl
    if (embedder.dims) env.MEMORY_EMBEDDING_DIMS = String(embedder.dims)
    if (embedder.extraHeaders) env.MEMORY_EMBEDDER_EXTRA_HEADERS = JSON.stringify(embedder.extraHeaders)
    if (embedder.extraBody) env.MEMORY_EMBEDDER_EXTRA_BODY = JSON.stringify(embedder.extraBody)
  }
  const vectorStore: MemoryVectorStoreConfig | undefined = cfg.vectorStore
  if (vectorStore) {
    if (vectorStore.provider) env.MEMORY_VECTOR_STORE = vectorStore.provider
    if (vectorStore.host) env.MEMORY_VECTOR_HOST = vectorStore.host
    if (vectorStore.port) env.MEMORY_VECTOR_PORT = String(vectorStore.port)
    if (vectorStore.apiKey) env.MEMORY_VECTOR_API_KEY = vectorStore.apiKey
    if (vectorStore.collectionName) env.MEMORY_COLLECTION_NAME = vectorStore.collectionName
    if (vectorStore.persistDirectory) env.MEMORY_PERSIST_DIR = vectorStore.persistDirectory
  } else {
    env.MEMORY_VECTOR_STORE = "chroma"
  }
  return env
}
