// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: public facade.
// Everything here is best-effort: on any failure memory features silently
// no-op and never block the conversation.

import { MemoryCapture } from "./capture.js"
import { MemoryClient } from "./client.js"
import { isMemoryEnabled, newMemorySessionId, resolveMemoryConfig } from "./config.js"
import { renderUserMemoryBlock } from "./injector.js"
import { MemoryServerManager } from "./server.js"
import type { MemoryConfig } from "./types.js"

export type {
  MemoryConfig,
  MemoryEntry,
  MemoryMessage,
  MemoryUserConfig,
} from "./types.js"
export { MemoryCapture } from "./capture.js"
export { MemoryClient } from "./client.js"
export {
  buildServerEnv,
  getHyMemoryHome,
  isMemoryEnabled,
  loadMemoryUserConfig,
  newMemorySessionId,
  resolveMemoryConfig,
} from "./config.js"
export { layerLabel, renderUserMemoryBlock } from "./injector.js"
export { MemoryServerManager } from "./server.js"

let cachedConfig: MemoryConfig | null = null
let cachedClient: MemoryClient | null = null
let cachedServer: MemoryServerManager | null = null
const captures = new Map<string, MemoryCapture>()

/** Effective memory config (cached; `null` when disabled). */
export function getMemoryConfig(): MemoryConfig | null {
  if (!isMemoryEnabled()) return null
  if (!cachedConfig) {
    cachedConfig = resolveMemoryConfig()
    if (!cachedConfig.enabled) return null
  }
  return cachedConfig
}

/** Reset cached config/client/server (used by tests). */
export function resetMemoryState(): void {
  cachedConfig = null
  cachedClient = null
  cachedServer?.stop()
  cachedServer = null
  captures.clear()
}

/** HTTP client bound to the effective config (`null` when disabled). */
export function getMemoryClient(): MemoryClient | null {
  const cfg = getMemoryConfig()
  if (!cfg) return null
  if (!cachedClient) cachedClient = new MemoryClient(cfg)
  return cachedClient
}

/** Server manager bound to the effective config (`null` when disabled). */
export function getMemoryServer(): MemoryServerManager | null {
  const cfg = getMemoryConfig()
  if (!cfg) return null
  if (!cachedServer) cachedServer = new MemoryServerManager(cfg)
  return cachedServer
}

/**
 * Recall long-term memories for a prompt and render the `<user_memory>`
 * block. Returns "" on any failure or when nothing relevant was found.
 */
export async function recallMemory(query: string): Promise<string> {
  try {
    const cfg = getMemoryConfig()
    const client = getMemoryClient()
    if (!cfg || !client || !cfg.autoRecall) return ""
    const q = query.trim()
    if (!q) return ""
    if (cfg.autoStartServer) {
      const server = getMemoryServer()
      if (server && !(await server.ensureServer())) return ""
    }
    const entries = await client.search(q)
    if (!entries || entries.length === 0) return ""
    return renderUserMemoryBlock(entries)
  } catch {
    return ""
  }
}

/**
 * Get (or create) the write-back buffer for a conversation.
 * Returns `null` when memory is disabled or auto-capture is off.
 */
export function getCapture(sessionId?: string): MemoryCapture | null {
  const cfg = getMemoryConfig()
  const client = getMemoryClient()
  if (!cfg || !client || !cfg.autoCapture) return null
  const sid = sessionId || cfg.sessionId || newMemorySessionId()
  let capture = captures.get(sid)
  if (!capture) {
    capture = new MemoryCapture(client, sid, cfg.memoryWriteTurnWindow)
    captures.set(sid, capture)
  }
  return capture
}
