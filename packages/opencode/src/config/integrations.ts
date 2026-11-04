/**
 * Integration setups — one-command onboarding (`momo setup --integration X`).
 *
 * Each integration is a named recipe: environment checks with concrete fix
 * hints, plus an optional config-file patch. uni-robot-agent ships
 * `setup --integration robodojo`; this is the momo equivalent — running one
 * command verifies the whole subsystem end-to-end and tells you exactly
 * what is missing.
 *
 * @module config/integrations
 */

import { execFile } from "child_process"
import * as fs from "fs"
import { resolveIntegration } from "../sim/integrations.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationCheckResult {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
  /** How to fix it when not ok. */
  readonly fix?: string
}

export interface IntegrationCheck {
  readonly name: string
  run(): Promise<{ ok: boolean; detail: string; fix?: string }>
}

export interface IntegrationSetup {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly checks: readonly IntegrationCheck[]
  /** Optional momo.jsonc patch merged in after all checks pass. */
  configPatch?(current: Record<string, unknown>): Record<string, unknown>
  /** Printed after a successful setup. */
  readonly hints?: readonly string[]
}

export interface IntegrationRunResult {
  readonly name: string
  readonly results: readonly IntegrationCheckResult[]
  readonly ok: boolean
  readonly configWritten?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envCheck(name: string, envVar: string, what: string): IntegrationCheck {
  return {
    name,
    run: async () => {
      const value = process.env[envVar]
      return value && value.trim()
        ? { ok: true, detail: `${envVar} is set` }
        : { ok: false, detail: `${envVar} is not set (${what})`, fix: `set ${envVar} in your environment or shell profile` }
    },
  }
}

function probeCommand(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
        if (!err) resolve({ ok: true, detail: String(stdout || stderr).trim().split("\n")[0] || "ok" })
        else resolve({ ok: false, detail: String(stderr || err.message).trim().split("\n")[0].slice(0, 200) })
      })
    } catch (err) {
      resolve({ ok: false, detail: err instanceof Error ? err.message : String(err) })
    }
  })
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

const simIntegration: IntegrationSetup = {
  name: "sim",
  label: "Genesis sim world (/sim, /optim --sim, dashboard workbench)",
  description: "Verify the Genesis world server stack: interpreter, genesis import, bundled server.",
  checks: [
    {
      name: "interpreter",
      run: async () => {
        const python = process.env.MOMO_SIM_PYTHON
        if (python && !fs.existsSync(python)) {
          return { ok: false, detail: `MOMO_SIM_PYTHON does not exist: ${python}`, fix: "point MOMO_SIM_PYTHON at a venv python.exe" }
        }
        const probe = await probeCommand(python || "python", ["--version"], 15_000)
        return probe.ok
          ? { ok: true, detail: `python responds (${probe.detail})${python ? " via MOMO_SIM_PYTHON" : ""}` }
          : { ok: false, detail: probe.detail, fix: python ? `check MOMO_SIM_PYTHON (${python})` : "install python or set MOMO_SIM_PYTHON to a venv interpreter" }
      },
    },
    {
      name: "genesis import",
      run: async () => {
        const python = process.env.MOMO_SIM_PYTHON || "python"
        const probe = await probeCommand(python, ["-c", "import genesis; print(genesis.__version__)"], 120_000)
        return probe.ok
          ? { ok: true, detail: `genesis ${probe.detail} importable` }
          : { ok: false, detail: probe.detail, fix: "run under the genesis venv: set MOMO_SIM_PYTHON to its python.exe" }
      },
    },
    {
      name: "world server",
      run: async () => {
        try {
          const server = resolveIntegration().serverPath
          return fs.existsSync(server)
            ? { ok: true, detail: server }
            : { ok: false, detail: `bundled server missing: ${server}`, fix: "rebuild the package (the vendored python/ tree is part of the repo)" }
        } catch (err) {
          return { ok: false, detail: err instanceof Error ? err.message : String(err), fix: "set MOMO_SIM_INTEGRATION to a known integration" }
        }
      },
    },
  ],
  hints: [
    "quick test: momo /sim doctor",
    "run a task: momo /sim run \"put the cube on the plate\"",
  ],
}

const voiceIntegration: IntegrationSetup = {
  name: "voice",
  label: "Voice input (/voice: recording + speech-to-text)",
  description: "Verify the speech-to-text configuration used by /voice.",
  checks: [
    envCheck("STT key", "MOMO_STT_API_KEY", "speech-to-text API key"),
    envCheck("STT endpoint", "MOMO_STT_BASE_URL", "OpenAI-compatible STT base URL"),
    envCheck("STT model", "MOMO_STT_MODEL", "STT model id (e.g. whisper-1)"),
  ],
  hints: [
    "quick test: momo /voice",
    "recording length defaults to 5s (MOMO_VOICE_SECONDS)",
  ],
}

/** Registry of known integration setups, in registration order. */
export const SETUP_INTEGRATIONS: Record<string, IntegrationSetup> = {
  sim: simIntegration,
  voice: voiceIntegration,
}

export function listSetupIntegrations(): IntegrationSetup[] {
  return Object.values(SETUP_INTEGRATIONS)
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Merge an integration's configPatch into the existing config object.
 * Returns the full merged config (to be written back), or null when the
 * integration defines no patch.
 */
export function applyConfigPatch(
  integration: IntegrationSetup,
  current: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!integration.configPatch) return null
  return { ...current, ...integration.configPatch(current) }
}

/**
 * Run one integration's checks. Never throws for check failures — only for
 * unknown integration names (with the available list in the message).
 */
export async function runIntegrationSetup(name: string): Promise<IntegrationRunResult> {
  const integration = SETUP_INTEGRATIONS[name.trim()]
  if (!integration) {
    const available = listSetupIntegrations().map((i) => i.name).join(", ")
    throw new Error(`unknown integration "${name}" (available: ${available})`)
  }
  const results: IntegrationCheckResult[] = []
  for (const check of integration.checks) {
    try {
      const r = await check.run()
      results.push({ name: check.name, ok: r.ok, detail: r.detail, ...(r.fix ? { fix: r.fix } : {}) })
    } catch (err) {
      results.push({ name: check.name, ok: false, detail: err instanceof Error ? err.message : String(err) })
    }
  }
  return { name: integration.name, results, ok: results.every((r) => r.ok) }
}
