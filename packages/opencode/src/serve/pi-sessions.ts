/**
 * Pi session trajectories — read-only listing and parsing for the
 * dashboard episode-replay view.
 *
 * Pi's SessionManager persists append-only JSONL trees: a `session`
 * header, `model_change` records, `message` records (user / assistant
 * with text+thinking+toolCall blocks / toolResult), and `compaction`
 * markers — each with an id/parentId chain and wall-clock timestamps.
 * This module parses those files with plain line reading (no pi runtime
 * session) and normalizes them into a flat, replayable timeline.
 *
 * Pi session files share a directory with momo's own session recorder
 * JSONL (prompt/response records); files are identified by their
 * `type: "session"` header line, not by location.
 *
 * @module serve/pi-sessions
 */

import * as fs from "fs"
import * as path from "path"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import { getSessionsDir } from "../config/config.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PiSessionSummary {
  /** Opaque route key (base64url of the absolute path). */
  readonly key: string
  readonly id: string
  readonly ts: string
  readonly cwd?: string
  readonly file: string
  readonly sizeBytes: number
  readonly mtimeMs: number
}

export interface PiToolCall {
  readonly id: string
  readonly name: string
  readonly args?: unknown
}

export interface PiTimelineEntry {
  readonly seq: number
  readonly ts?: string
  readonly kind: "session" | "model" | "message" | "compaction" | "other"
  readonly role?: "user" | "assistant" | "toolResult"
  readonly model?: string
  /** Concatenated text blocks (truncated for very long content). */
  readonly text?: string
  /** Concatenated thinking blocks (truncated for very long content). */
  readonly thinking?: string
  readonly toolCalls?: ReadonlyArray<PiToolCall>
  /** toolResult fields */
  readonly toolName?: string
  readonly toolCallId?: string
  readonly isError?: boolean
  readonly durationMs?: number
  /** usage.totalTokens for assistant turns */
  readonly tokens?: number
}

export interface PiSessionDetail {
  readonly key: string
  readonly id: string
  readonly cwd?: string
  readonly file: string
  readonly entries: ReadonlyArray<PiTimelineEntry>
  readonly stats: {
    readonly messages: number
    readonly toolCalls: number
    readonly tokens: number
    readonly firstTs?: string
    readonly lastTs?: string
  }
}

// ---------------------------------------------------------------------------
// Keys and roots
// ---------------------------------------------------------------------------

function encodeKey(absPath: string): string {
  return Buffer.from(absPath, "utf-8").toString("base64url")
}

function decodeKey(key: string): string {
  return Buffer.from(key, "base64url").toString("utf-8")
}

/** Directories scanned for pi session JSONL files. */
export function piSessionRoots(): string[] {
  return [
    path.resolve(getSessionsDir()), // pi 1.1.0-era flat files in the momo home
    path.resolve(path.join(getAgentDir(), "sessions")), // pi >= 1.4.0 layout
  ]
}

function isUnderRoot(file: string, roots: readonly string[]): boolean {
  const resolved = path.resolve(file)
  return roots.some((root) => resolved === root || resolved.startsWith(root + path.sep))
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

const MAX_LIST_BYTES = 64 * 1024 * 1024

function listJsonlFiles(root: string, depth: number): string[] {
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const item of items) {
    const full = path.join(root, item.name)
    if (item.isDirectory()) {
      if (depth > 0) out.push(...listJsonlFiles(full, depth - 1))
      continue
    }
    if (item.isFile() && item.name.endsWith(".jsonl")) out.push(full)
  }
  return out
}

function firstLine(file: string): string | null {
  let fd: number | null = null
  try {
    fd = fs.openSync(file, "r")
    const buf = Buffer.alloc(4096)
    const read = fs.readSync(fd, buf, 0, buf.length, 0)
    const chunk = buf.toString("utf-8", 0, read)
    const nl = chunk.indexOf("\n")
    return (nl === -1 ? chunk : chunk.slice(0, nl)).trim() || null
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        /* ignore */
      }
    }
  }
}

function parseSessionHeader(line: string | null): { id?: unknown; timestamp?: unknown; cwd?: unknown } | null {
  if (!line) return null
  try {
    const header = JSON.parse(line) as { type?: unknown; id?: unknown; timestamp?: unknown; cwd?: unknown }
    return header.type === "session" && typeof header.id === "string" ? header : null
  } catch {
    return null
  }
}

/** List pi session trajectories, newest first. */
export function listPiSessions(): PiSessionSummary[] {
  const roots = piSessionRoots()
  const byKey = new Map<string, PiSessionSummary>()
  for (const root of roots) {
    for (const file of listJsonlFiles(root, 2)) {
      try {
        const stat = fs.statSync(file)
        if (stat.size === 0 || stat.size > MAX_LIST_BYTES) continue
        const header = parseSessionHeader(firstLine(file))
        if (!header) continue // momo recorder day-files and other JSONL are not sessions
        const key = encodeKey(file)
        byKey.set(key, {
          key,
          id: String(header.id ?? path.basename(file, ".jsonl")),
          ts: typeof header.timestamp === "string" ? header.timestamp : stat.mtime.toISOString(),
          ...(typeof header.cwd === "string" ? { cwd: header.cwd } : {}),
          file: path.basename(file),
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
        })
      } catch {
        /* unreadable file — skip */
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.mtimeMs - a.mtimeMs)
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const MAX_FIELD_CHARS = 20_000

function truncate(value: string): string {
  return value.length > MAX_FIELD_CHARS
    ? value.slice(0, MAX_FIELD_CHARS) + ` … [+${value.length - MAX_FIELD_CHARS} chars]`
    : value
}

function joinBlocks(blocks: ReadonlyArray<Record<string, unknown>>, field: string): string | undefined {
  const parts = blocks
    .map((b) => (typeof b[field] === "string" ? (b[field] as string) : ""))
    .filter((s) => s.trim().length > 0)
  const joined = parts.join("\n").trim()
  return joined ? truncate(joined) : undefined
}

function normalizeEntry(rec: Record<string, unknown>, seq: number): PiTimelineEntry | null {
  const kind = typeof rec.type === "string" ? rec.type : "other"
  const ts = typeof rec.timestamp === "string" ? rec.timestamp : undefined
  if (kind === "session") {
    return { seq, ...(ts ? { ts } : {}), kind: "session" }
  }
  if (kind === "model_change" || kind === "thinking_level_change") {
    return {
      seq,
      ...(ts ? { ts } : {}),
      kind: "model",
      ...(typeof rec.modelId === "string" ? { model: rec.modelId } : {}),
    }
  }
  if (kind === "compaction") {
    return { seq, ...(ts ? { ts } : {}), kind: "compaction" }
  }
  if (kind !== "message" || !rec.message || typeof rec.message !== "object") {
    return { seq, ...(ts ? { ts } : {}), kind: "other" }
  }
  const msg = rec.message as Record<string, unknown>
  const role =
    msg.role === "user" || msg.role === "assistant" || msg.role === "toolResult"
      ? msg.role
      : undefined
  const blocks = Array.isArray(msg.content)
    ? (msg.content as ReadonlyArray<Record<string, unknown>>).filter(
        (b) => b && typeof b === "object",
      )
    : []
  const toolCalls = blocks
    .filter((b) => b.type === "toolCall")
    .map((b) => {
      const call: { id: string; name: string; args?: unknown } = {
        id: String(b.id ?? ""),
        name: String(b.name ?? "unknown"),
      }
      if (b.arguments !== undefined) call.args = b.arguments
      return call
    })
  const usage = (msg.usage ?? {}) as Record<string, unknown>
  return {
    seq,
    ...(ts ? { ts } : {}),
    kind: "message",
    ...(role ? { role } : {}),
    ...(joinBlocks(blocks, "text") ? { text: joinBlocks(blocks, "text") } : {}),
    ...(joinBlocks(blocks, "thinking")
      ? { thinking: joinBlocks(blocks, "thinking") }
      : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(typeof msg.toolName === "string" ? { toolName: msg.toolName } : {}),
    ...(typeof msg.toolCallId === "string" ? { toolCallId: msg.toolCallId } : {}),
    ...(msg.isError === true ? { isError: true } : {}),
    ...(typeof msg.durationMs === "number" ? { durationMs: msg.durationMs } : {}),
    ...(typeof usage.totalTokens === "number" ? { tokens: usage.totalTokens } : {}),
  }
}

/**
 * Parse one pi session file into a replayable timeline.
 * Throws when the key is unknown, escapes the scan roots, or the file
 * is not a pi session.
 */
export function readPiSession(key: string): PiSessionDetail {
  const file = path.resolve(decodeKey(key))
  if (!isUnderRoot(file, piSessionRoots())) {
    throw new Error("session key is outside the session directories")
  }
  if (!fs.existsSync(file)) throw new Error(`session file not found`)
  const raw = fs.readFileSync(file, "utf-8")
  const entries: PiTimelineEntry[] = []
  let header: Record<string, unknown> = {}
  let messages = 0
  let toolCalls = 0
  let tokens = 0
  let firstTs: string | undefined
  let lastTs: string | undefined
  const lines = raw.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue // tolerate trailing partial writes
    }
    if (rec.type === "session") {
      header = rec
    }
    const entry = normalizeEntry(rec, entries.length)
    if (entry) {
      entries.push(entry)
      if (entry.ts) {
        firstTs ??= entry.ts
        lastTs = entry.ts
      }
      if (entry.kind === "message") {
        messages += 1
        toolCalls += entry.toolCalls?.length ?? 0
        tokens += entry.tokens ?? 0
      }
    }
  }
  if (header.type !== "session") throw new Error("not a pi session file")
  return {
    key,
    id: String(header.id ?? path.basename(file, ".jsonl")),
    ...(typeof header.cwd === "string" ? { cwd: header.cwd } : {}),
    file: path.basename(file),
    entries,
    stats: {
      messages,
      toolCalls,
      tokens,
      ...(firstTs ? { firstTs } : {}),
      ...(lastTs ? { lastTs } : {}),
    },
  }
}
