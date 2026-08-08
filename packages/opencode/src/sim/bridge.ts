/**
 * SimBridge — NDJSON JSON-RPC client for the genesis_world server.
 *
 * Owns a persistent Python child process running
 * `python/genesis_world/server.py`. Requests are newline-delimited JSON;
 * protocol lines are prefixed with @@RPC@@ so Genesis/engine logs can
 * share stdout without corrupting framing.
 *
 * @module sim/bridge
 */

import { spawn, type ChildProcess } from "child_process"
import * as path from "path"
import { fileURLToPath } from "url"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeRequestOpts {
  /** Per-request timeout in ms (default: 120_000) */
  readonly timeoutMs?: number
}

export interface SimBridgeOpts {
  /** Python executable (default: MOMO_SIM_PYTHON or "python") */
  readonly python?: string
  /** Server script path (default: bundled genesis_world/server.py) */
  readonly serverPath?: string
  /** Extra env for the child */
  readonly env?: Record<string, string>
}

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const RPC_PREFIX = "@@RPC@@"
const LOG_PREFIX = "@@LOG@@"

// ---------------------------------------------------------------------------
// SimBridge
// ---------------------------------------------------------------------------

export class SimBridge {
  private child: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = ""
  private closed = false

  /** Lines logged by the world server (@@LOG@@ / non-protocol output). */
  readonly serverLog: string[] = []

  constructor(private readonly opts: SimBridgeOpts = {}) {}

  /** Default path of the bundled world server. */
  static defaultServerPath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // src/sim/ → ../../python/genesis_world/server.py (works from src and dist)
    return path.resolve(here, "..", "..", "python", "genesis_world", "server.py")
  }

  /** Spawn the world server process. Idempotent. */
  start(): void {
    if (this.child) return
    const python = this.opts.python || process.env.MOMO_SIM_PYTHON || "python"
    const serverPath =
      this.opts.serverPath ||
      process.env.MOMO_SIM_SERVER ||
      SimBridge.defaultServerPath()

    this.child = spawn(python, ["-u", serverPath], {
      env: { ...process.env, ...this.opts.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })

    this.child.stdout?.on("data", (d: Buffer) => this.onData(d.toString()))
    this.child.stderr?.on("data", (d: Buffer) => {
      this.serverLog.push(`[stderr] ${d.toString().trim()}`)
    })
    this.child.on("error", (err) => this.failAll(new Error(`spawn failed: ${err.message}`)))
    this.child.on("close", (code) => {
      this.failAll(new Error(`world server exited (code ${code})`))
      this.child = null
      // A crashed world loses its persistent namespace — fail fast
      // instead of silently restarting with an empty world.
      this.closed = true
    })
  }

  /** Send a JSON-RPC request and await its result. Throws on server errors. */
  request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    opts: BridgeRequestOpts = {},
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error("bridge is closed"))
    this.start()
    if (!this.child?.stdin) {
      return Promise.reject(new Error("world server stdin unavailable"))
    }

    const id = this.nextId++
    const timeoutMs = opts.timeoutMs ?? 120_000

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request '${method}' timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      })

      this.child!.stdin!.write(JSON.stringify({ id, method, params }) + "\n")
    })
  }

  // -- Convenience wrappers --------------------------------------------------

  ping() {
    return this.request<{ pong: boolean; initialized: boolean }>("ping")
  }

  initWorld(params: { viewer?: boolean; backend?: string } = {}) {
    return this.request<{
      initialized: boolean
      backend: string
      genesis_version: string
      skills_loaded: Array<{ file: string; status: string; error?: string }>
    }>("init", params, { timeoutMs: 300_000 }) // Genesis init is slow on CPU
  }

  exec(code: string, timeoutMs = 300_000) {
    return this.request<{ stdout: string; stderr: string; error?: string }>(
      "exec",
      { code },
      { timeoutMs },
    )
  }

  evalExpr(expr: string) {
    return this.request<{ repr?: string; error?: string }>("eval", { expr })
  }

  observe() {
    return this.request<{ observation: unknown; source: string; error?: string }>(
      "observe",
    )
  }

  /** Shut down the server and release resources. */
  async close(): Promise<void> {
    if (this.closed) return
    try {
      if (this.child) {
        await this.request("shutdown", {}, { timeoutMs: 5_000 }).catch(() => {})
      }
    } finally {
      this.closed = true
      for (const p of this.pending.values()) {
        clearTimeout(p.timer)
        p.reject(new Error("bridge closed"))
      }
      this.pending.clear()
      try {
        this.child?.kill()
      } catch {
        /* already dead */
      }
      this.child = null
    }
  }

  // -- Framing ---------------------------------------------------------------

  private onData(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      if (line.startsWith(RPC_PREFIX)) {
        this.onMessage(line.slice(RPC_PREFIX.length))
      } else {
        this.serverLog.push(
          line.startsWith(LOG_PREFIX) ? line.slice(LOG_PREFIX.length) : line,
        )
      }
    }
  }

  private onMessage(json: string): void {
    let msg: { id?: number | null; ok?: boolean; result?: unknown; error?: string }
    try {
      msg = JSON.parse(json)
    } catch {
      this.serverLog.push(`[protocol] unparseable line: ${json.slice(0, 200)}`)
      return
    }
    if (msg.id == null) return // server-initiated notification (e.g. shutdown ack)
    const pending = this.pending.get(msg.id)
    if (!pending) return
    this.pending.delete(msg.id)
    clearTimeout(pending.timer)
    if (msg.ok) pending.resolve(msg.result)
    else pending.reject(new Error(msg.error || "unknown world server error"))
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }
}
