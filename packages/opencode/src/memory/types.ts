// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: shared types.

/** User-facing LLM endpoint config for the Hy-Memory server (pro/ultra extraction). */
export interface MemoryLlmConfig {
  readonly provider?: string
  readonly model?: string
  readonly apiKey?: string
  readonly baseUrl?: string
  readonly temperature?: number
  readonly maxTokens?: number
  readonly thinkingMode?: string
}

/** User-facing embedder endpoint config (required by all modes). */
export interface MemoryEmbedderConfig {
  readonly provider?: string
  readonly model?: string
  readonly apiKey?: string
  readonly baseUrl?: string
  readonly dims?: number
  readonly extraHeaders?: Record<string, string>
  readonly extraBody?: Record<string, unknown>
}

/** User-facing vector store backend config. */
export interface MemoryVectorStoreConfig {
  readonly provider?: string
  readonly host?: string
  readonly port?: number
  readonly apiKey?: string
  readonly collectionName?: string
  readonly persistDirectory?: string
}

/** `memory` block in momo.jsonc (all fields optional). */
export interface MemoryUserConfig {
  readonly userId?: string
  readonly agentId?: string
  readonly sessionId?: string
  readonly mode?: "lite" | "pro" | "ultra"
  readonly serverUrl?: string
  readonly serverPort?: number
  readonly autoStartServer?: boolean
  readonly autoRecall?: boolean
  readonly autoCapture?: boolean
  readonly memoryWriteTurnWindow?: number
  readonly topK?: number
  readonly searchThreshold?: number
  readonly profileLimit?: number
  readonly profileMinScore?: number
  readonly pythonPath?: string
  readonly llm?: MemoryLlmConfig
  readonly embedder?: MemoryEmbedderConfig
  readonly vectorStore?: MemoryVectorStoreConfig
}

/** Resolved config (every field filled in). */
export interface MemoryConfig {
  readonly enabled: boolean
  readonly userId: string
  readonly agentId: string
  readonly sessionId: string
  readonly mode: "lite" | "pro" | "ultra"
  readonly serverUrl: string
  readonly serverPort: number
  readonly autoStartServer: boolean
  readonly autoRecall: boolean
  readonly autoCapture: boolean
  readonly memoryWriteTurnWindow: number
  readonly topK: number
  readonly searchThreshold: number
  readonly profileLimit: number
  readonly profileMinScore: number
  readonly pythonPath: string
  readonly llm?: MemoryLlmConfig
  readonly embedder?: MemoryEmbedderConfig
  readonly vectorStore?: MemoryVectorStoreConfig
}

/** One retrieved / listed memory item. */
export interface MemoryEntry {
  readonly content: string
  readonly score?: number
  readonly layer?: string
  readonly memory_id?: string
}

/** Chat-scene search returns profile / proactive / normal channels. */
export interface MemorySearchGroups {
  readonly profile?: MemoryEntry[]
  readonly proactive?: MemoryEntry[]
  readonly normal?: MemoryEntry[]
}

/** A chat message in OpenAI format (used for write-back). */
export interface MemoryMessage {
  readonly role: "user" | "assistant" | "tool"
  readonly content: string
}
