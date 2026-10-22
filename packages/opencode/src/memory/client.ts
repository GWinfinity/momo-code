// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: HTTP client for the local Hy-Memory server.
// Every method is best-effort: failures return null and never throw, so memory
// problems can never block the conversation.

import type {
  MemoryConfig,
  MemoryEntry,
  MemoryMessage,
  MemorySearchGroups,
} from "./types.js"

export interface MemoryAddResult {
  readonly success: boolean
  readonly memory_id?: string
  readonly error?: string
}

export interface MemoryListResult {
  readonly memories: MemoryEntry[]
  readonly total: number
}

export interface MemoryDeleteResult {
  readonly success: boolean
  readonly deleted_count?: number
}

const HEALTH_TIMEOUT_MS = 3_000
const READ_TIMEOUT_MS = 30_000
const WRITE_TIMEOUT_MS = 60_000

/** Flatten {profile, proactive, normal} groups (or a plain array) into one list. */
export function flattenSearchMemories(raw: unknown): MemoryEntry[] {
  if (Array.isArray(raw)) return raw as MemoryEntry[]
  if (raw && typeof raw === "object") {
    const groups = raw as Record<string, unknown>
    const ordered = ["profile", "proactive", "normal"]
    const result: MemoryEntry[] = []
    for (const key of ordered) {
      if (Array.isArray(groups[key])) result.push(...(groups[key] as MemoryEntry[]))
    }
    for (const [key, value] of Object.entries(groups)) {
      if (!ordered.includes(key) && Array.isArray(value)) {
        result.push(...(value as MemoryEntry[]))
      }
    }
    return result
  }
  return []
}

export class MemoryClient {
  private readonly baseUrl: string

  constructor(private readonly cfg: MemoryConfig) {
    this.baseUrl = cfg.serverUrl.replace(/\/+$/, "")
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = READ_TIMEOUT_MS,
  ): Promise<T | null> {
    try {
      const fetchOpts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      }
      if (body !== undefined) fetchOpts.body = JSON.stringify(body)
      const resp = await fetch(`${this.baseUrl}${path}`, fetchOpts)
      if (!resp.ok) return null
      return (await resp.json()) as T
    } catch {
      return null
    }
  }

  /** Probe the server. Returns false on any failure. */
  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      })
      return resp.ok
    } catch {
      return false
    }
  }

  /** Write a plain text memory or an OpenAI-format message trace. */
  async add(
    data: string | MemoryMessage[],
    opts: { sessionId?: string; enableAgent?: boolean } = {},
  ): Promise<MemoryAddResult | null> {
    const payload: Record<string, unknown> = {
      user_id: this.cfg.userId,
      agent_id: this.cfg.agentId,
      session_id: opts.sessionId ?? this.cfg.sessionId,
      enable_agent: opts.enableAgent ?? true,
      memory_at: new Date().toISOString(),
    }
    if (typeof data === "string") payload.text = data
    else payload.messages = data
    return this.request<MemoryAddResult>("POST", "/api/v1/add", payload, WRITE_TIMEOUT_MS)
  }

  /** Search memories; returns the flattened hit list (profile > proactive > normal). */
  async search(
    query: string,
    opts: { limit?: number; minScore?: number; agentScoped?: boolean } = {},
  ): Promise<MemoryEntry[] | null> {
    const payload: Record<string, unknown> = {
      query,
      user_ids: [this.cfg.userId],
      limit: opts.limit ?? this.cfg.topK,
      min_score: opts.minScore ?? this.cfg.searchThreshold,
      profile_limit: this.cfg.profileLimit,
      profile_min_score: this.cfg.profileMinScore,
    }
    if (opts.agentScoped) payload.agent_ids = [this.cfg.agentId]
    const resp = await this.request<{ memories?: unknown }>(
      "POST",
      "/api/v1/search",
      payload,
      READ_TIMEOUT_MS,
    )
    if (!resp) return null
    return flattenSearchMemories(resp.memories)
  }

  async list(opts: { limit?: number; offset?: number } = {}): Promise<MemoryListResult | null> {
    const resp = await this.request<{ vdb?: { memories?: MemoryEntry[]; total?: number } }>(
      "POST",
      "/api/v1/list",
      {
        user_id: this.cfg.userId,
        agent_id: this.cfg.agentId,
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
      },
    )
    if (!resp) return null
    return {
      memories: resp.vdb?.memories ?? [],
      total: resp.vdb?.total ?? (resp.vdb?.memories?.length ?? 0),
    }
  }

  async get(memoryId: string): Promise<MemoryEntry | null> {
    return this.request<MemoryEntry>("GET", `/api/v1/memories/${encodeURIComponent(memoryId)}`)
  }

  async update(memoryId: string, content: string): Promise<unknown> {
    return this.request<unknown>(
      "PUT",
      `/api/v1/memories/${encodeURIComponent(memoryId)}`,
      { content },
      WRITE_TIMEOUT_MS,
    )
  }

  async delete(memoryId: string): Promise<MemoryDeleteResult | null> {
    return this.request<MemoryDeleteResult>(
      "DELETE",
      `/api/v1/memories/${encodeURIComponent(memoryId)}`,
      undefined,
      WRITE_TIMEOUT_MS,
    )
  }

  async deleteAll(): Promise<unknown> {
    return this.request<unknown>(
      "POST",
      "/api/v1/delete_all",
      { user_id: this.cfg.userId, agent_id: this.cfg.agentId },
      WRITE_TIMEOUT_MS,
    )
  }
}
