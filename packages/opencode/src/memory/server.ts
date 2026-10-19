// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: local Python server lifecycle.
// Mirrors the official `opencode-hy-memory` plugin: reuse a healthy server,
// otherwise bootstrap ~/.hy-memory/.venv and spawn `python -m hy_memory.server`.

import { spawn, execFile } from "child_process"
import fs from "fs"
import path from "path"
import { buildServerEnv, getHyMemoryHome } from "./config.js"
import { MemoryClient } from "./client.js"
import type { MemoryConfig } from "./types.js"

const HY_MEMORY_PACKAGE = "hy-memory==2.0.3"
const START_POLL_TIMEOUT_MS = 30_000
const START_POLL_INTERVAL_MS = 500

const IS_WIN = process.platform === "win32"

function venvPythonPath(): string {
  return IS_WIN
    ? path.join(getHyMemoryHome(), ".venv", "Scripts", "python.exe")
    : path.join(getHyMemoryHome(), ".venv", "bin", "python")
}

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        env: opts.env ?? process.env,
        timeout: opts.timeoutMs ?? 600_000,
        windowsHide: true,
        shell: false,
      },
      (error, stdout, stderr) => {
        resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Manages the Hy-Memory Python server for one config.
 * `ensureServer()` is idempotent and cached; it never throws.
 */
export class MemoryServerManager {
  private child: ReturnType<typeof spawn> | null = null
  private ensured: Promise<boolean> | null = null
  private warned = false

  constructor(private readonly cfg: MemoryConfig) {}

  private warnOnce(msg: string): void {
    if (this.warned) return
    this.warned = true
    console.warn(`[momo-memory] ${msg}`)
  }

  /** True when a server is already reachable (healthy instance is reused). */
  async isHealthy(): Promise<boolean> {
    return new MemoryClient(this.cfg).health()
  }

  /**
   * Make sure a Hy-Memory server is reachable.
   * Order: reuse healthy server → (if autoStartServer) bootstrap venv + spawn → poll.
   */
  ensureServer(): Promise<boolean> {
    if (!this.ensured) this.ensured = this.doEnsure()
    return this.ensured
  }

  private async doEnsure(): Promise<boolean> {
    if (await this.isHealthy()) return true
    if (!this.cfg.autoStartServer) {
      this.warnOnce(`no server at ${this.cfg.serverUrl} and autoStartServer is disabled`)
      return false
    }
    try {
      const python = await this.bootstrap()
      if (!python) return false
      this.spawnServer(python)
      return await this.waitForHealth()
    } catch (err) {
      this.warnOnce(`failed to start Hy-Memory server: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }

  /**
   * Ensure the ~/.hy-memory/.venv exists with `hy-memory` installed.
   * Returns the venv python path, or null on failure.
   */
  private async bootstrap(): Promise<string | null> {
    const home = getHyMemoryHome()
    const venvPython = venvPythonPath()
    if (!fs.existsSync(venvPython)) {
      fs.mkdirSync(home, { recursive: true })
      fs.mkdirSync(path.join(home, "db"), { recursive: true })
      const created = await run(this.cfg.pythonPath, ["-m", "venv", path.join(home, ".venv")], {
        timeoutMs: 300_000,
      })
      if (!created.ok || !fs.existsSync(venvPython)) {
        this.warnOnce(
          `venv creation failed (is Python >= 3.8 installed?): ${created.stderr.trim().slice(0, 200)}`,
        )
        return null
      }
    }
    // Skip pip when the package already imports (fast path on later runs).
    const probe = await run(venvPython, ["-c", "import hy_memory"], { timeoutMs: 30_000 })
    if (!probe.ok) {
      const installed = await run(venvPython, ["-m", "pip", "install", HY_MEMORY_PACKAGE], {
        timeoutMs: 600_000,
      })
      if (!installed.ok) {
        this.warnOnce(
          `pip install ${HY_MEMORY_PACKAGE} failed (network to pypi.org?): ${installed.stderr.trim().slice(0, 200)}`,
        )
        return null
      }
    }
    return venvPython
  }

  /** Spawn `python -m hy_memory.server`. Idempotent per instance. */
  private spawnServer(python: string): void {
    if (this.child) return
    const child = spawn(python, ["-m", "hy_memory.server", "--port", String(this.cfg.serverPort)], {
      env: { ...process.env, ...buildServerEnv(this.cfg) },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    })
    // Always attach an error listener: a missing binary must not become an
    // uncaught exception that outlives this module (Windows lesson learned).
    child.on("error", (err) => {
      this.warnOnce(`server spawn failed: ${err.message}`)
      this.child = null
    })
    child.stderr?.on("data", (d: Buffer) => {
      const line = d.toString().trim()
      if (line) this.warnOnce(`server stderr: ${line.slice(0, 300)}`)
    })
    child.on("close", () => {
      this.child = null
    })
    this.child = child
  }

  private async waitForHealth(): Promise<boolean> {
    const deadline = Date.now() + START_POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return true
      await sleep(START_POLL_INTERVAL_MS)
    }
    this.warnOnce(`server did not become healthy within ${START_POLL_TIMEOUT_MS / 1000}s`)
    return false
  }

  /** Stop a server we spawned (external servers are left alone). */
  stop(): void {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
    this.ensured = null
  }
}
