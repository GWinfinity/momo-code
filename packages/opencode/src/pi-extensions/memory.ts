// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Hy-Memory long-term memory
// (1) auto-recall into the system prompt, (2) throttled passive write-back,
// (3) LLM-callable memory_search / memory_add / memory_list / memory_delete.

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import {
  getCapture,
  getMemoryClient,
  getMemoryConfig,
  getMemoryServer,
  recallMemory,
} from "../memory/index.js"
import type { MemoryEntry } from "../memory/types.js"

/** Make sure the server is up and the client exists. Returns null when not. */
async function readyClient() {
  const cfg = getMemoryConfig()
  const client = getMemoryClient()
  if (!cfg || !client) return null
  if (cfg.autoStartServer) {
    const server = getMemoryServer()
    if (server && !(await server.ensureServer())) return null
  } else if (!(await client.health())) {
    return null
  }
  return client
}

function formatEntries(entries: readonly MemoryEntry[]): string {
  return entries
    .map(
      (m, i) =>
        `${i + 1}. ${m.content} (score: ${((m.score ?? 0) * 100).toFixed(0)}%, layer: ${m.layer ?? "?"}, id: ${m.memory_id ?? "?"})`,
    )
    .join("\n")
}

// -- Tool handlers (shared with tests; each returns the model-facing text) --

export async function memorySearchHandler(query: string, limit?: number): Promise<string> {
  try {
    const client = await readyClient()
    if (!client) return "Memory is unavailable."
    const res = await client.search(query, { limit })
    if (!res) return "Memory search failed."
    if (res.length === 0) return "No relevant memories found."
    return `Found ${res.length} memories:\n${formatEntries(res)}`
  } catch (err) {
    return `Memory search failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function memoryAddHandler(content: string): Promise<string> {
  try {
    const client = await readyClient()
    if (!client) return "Memory is unavailable."
    const res = await client.add(content)
    if (!res) return "Failed to store memory."
    return res.success
      ? `Stored memory (id: ${res.memory_id ?? "unknown"}).`
      : `Failed to store memory: ${res.error ?? "unknown"}`
  } catch (err) {
    return `Memory add failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function memoryListHandler(limit?: number, offset?: number): Promise<string> {
  try {
    const client = await readyClient()
    if (!client) return "Memory is unavailable."
    const res = await client.list({ limit, offset })
    if (!res) return "Memory list failed."
    if (res.memories.length === 0) return "No memories stored."
    return `Memories (${res.memories.length}/${res.total}):\n${res.memories
      .map((m, i) => `${i + 1}. ${m.content} (layer: ${m.layer ?? "?"}, id: ${m.memory_id ?? "?"})`)
      .join("\n")}`
  } catch (err) {
    return `Memory list failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function memoryDeleteHandler(memoryId: string): Promise<string> {
  try {
    const client = await readyClient()
    if (!client) return "Memory is unavailable."
    const res = await client.delete(memoryId)
    if (!res) return "Delete failed."
    return res.success ? `Deleted ${res.deleted_count ?? 1} memory(ies).` : "Delete failed."
  } catch (err) {
    return `Memory delete failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** Extract the concatenated text of a Pi agent message. */
function messageText(message: unknown): string {
  const msg = message as { content?: unknown }
  if (typeof msg?.content === "string") return msg.content
  if (Array.isArray(msg?.content)) {
    return msg.content
      .map((part) =>
        part && typeof part === "object" && (part as { type?: string }).type === "text"
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("")
  }
  return ""
}

/**
 * Pi Extension: memory recall + write-back + explicit memory tools.
 */
export const memoryExtension: ExtensionFactory = (pi) => {
  let lastPrompt = ""

  pi.on("before_agent_start", async (event) => {
    lastPrompt = event.prompt || ""
    try {
      const memBlock = await recallMemory(lastPrompt)
      if (memBlock) {
        // Re-render the *current* system prompt and append: returning
        // {systemPrompt} force-replaces the whole prompt, so a delta-only
        // return would drop blocks added by earlier handlers (e.g. tactics).
        return { systemPrompt: `${event.systemPrompt}\n\n---\n\n${memBlock}` }
      }
    } catch {
      // Memory recall is best-effort; never block the agent
    }
  })

  pi.on("agent_end", async (event, context) => {
    try {
      const messages = event.messages ?? []
      let assistantText = ""
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i] as { role?: string }
        if (msg?.role === "assistant") {
          assistantText = messageText(messages[i])
          break
        }
      }
      const capture = getCapture(context.sessionManager?.getSessionId?.())
      if (capture && (lastPrompt || assistantText)) {
        capture.addTurn(lastPrompt, assistantText)
        await capture.maybeFlush()
      }
    } catch {
      // Memory write-back is best-effort
    }
  })

  pi.on("agent_settled", async (_event, context) => {
    try {
      void getCapture(context.sessionManager?.getSessionId?.())?.flush()
    } catch {
      // Memory write-back is best-effort
    }
  })

  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description:
      "Search the user's long-term memory for relevant facts, preferences, and past context. Returns ranked memories with their memory_id (needed before memory_delete).",
    promptSnippet: "memory_search — recall long-term user memory",
    parameters: Type.Object({
      query: Type.String({ description: "What to search for" }),
      limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
    }),
    async execute(_toolCallId, params) {
      const text = await memorySearchHandler(params.query, params.limit)
      return { content: [{ type: "text", text }], details: undefined }
    },
  })

  pi.registerTool({
    name: "memory_add",
    label: "Memory Add",
    description:
      "Store a new long-term memory about the user (a stable preference, fact, decision, or plan). Use sparingly for durable, high-value information — not transient chatter.",
    promptSnippet: "memory_add — persist a durable user fact",
    parameters: Type.Object({
      content: Type.String({ description: "The memory content to store (self-contained, third person)" }),
    }),
    async execute(_toolCallId, params) {
      const text = await memoryAddHandler(params.content)
      return { content: [{ type: "text", text }], details: undefined }
    },
  })

  pi.registerTool({
    name: "memory_list",
    label: "Memory List",
    description: "List stored memories for the current user (most recent first). Useful for review.",
    promptSnippet: "memory_list — review stored memories",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max items (default 20)" })),
      offset: Type.Optional(Type.Number({ description: "Pagination offset (default 0)" })),
    }),
    async execute(_toolCallId, params) {
      const text = await memoryListHandler(params.limit, params.offset)
      return { content: [{ type: "text", text }], details: undefined }
    },
  })

  pi.registerTool({
    name: "memory_delete",
    label: "Memory Delete",
    description:
      "Delete a specific memory by its memory_id. Call memory_search first to find the id. Use only when the user clearly wants something forgotten.",
    promptSnippet: "memory_delete — forget a memory by id",
    parameters: Type.Object({
      memory_id: Type.String({ description: "The memory_id returned by memory_search" }),
    }),
    async execute(_toolCallId, params) {
      const text = await memoryDeleteHandler(params.memory_id)
      return { content: [{ type: "text", text }], details: undefined }
    },
  })
}
