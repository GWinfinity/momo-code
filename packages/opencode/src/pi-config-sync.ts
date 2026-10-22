// SPDX-License-Identifier: MIT
// Bridge momo's provider config into the Pi engine's agent-directory files.
//
// The Pi engine resolves credentials its own way (see
// node_modules/@earendil-works/pi-coding-agent/docs/providers.md):
//   1. <agent-dir>/auth.json entries keyed by built-in provider ID
//   2. "providers" entries in <agent-dir>/models.json (custom endpoints)
//   3. provider-native environment variables (ANTHROPIC_API_KEY, ...)
//
// momo's own chain (CC Switch → ~/.momo/momo.jsonc → MOMO_* env) only feeds
// the legacy CLI, so a fresh `momo` start failed with "No API key found for
// the selected model" even when momo was fully configured. This module closes
// the gap: it reuses the exact momo resolution and writes Pi-native
// auth.json / models.json / settings.json under the Pi agent directory.
//
// Merge policy: the resolved momo provider wins for its own entries; unrelated
// providers and non-api_key credentials (e.g. OAuth from /login) are never
// touched. Everything is best-effort — a failed sync must never break startup.

import fs from "fs"
import path from "path"
import { resolveProviderConfig } from "./cli/chat.js"

/**
 * Default base URLs of Pi built-in providers that momo can resolve to.
 * When momo's baseUrl matches one of these, the key goes to auth.json under
 * the built-in provider ID. Otherwise a "momo" custom provider is declared
 * in models.json (relay endpoints, and providers Pi does not bundle such as
 * zhipu/doubao/stepfun/alibaba/moonshot/custom).
 * Keep in sync with the factories table in src/cli/chat.ts.
 */
const PI_BUILTIN_DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  minimax: "https://api.minimaxi.com/v1",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
}

/** Custom-provider slot declared in models.json for non-built-in endpoints. */
const MOMO_PROVIDER_ID = "momo"

export interface PiSyncResult {
  synced: boolean
  provider?: string
  model?: string
}

interface PiAuthEntry {
  type?: string
  key?: string
  [key: string]: unknown
}

interface PiModelDecl {
  id: string
  [key: string]: unknown
}

interface PiProviderEntry {
  baseUrl?: string
  api?: string
  apiKey?: string
  models?: PiModelDecl[]
  [key: string]: unknown
}

interface PiModelsFile {
  providers?: Record<string, PiProviderEntry>
  [key: string]: unknown
}

/**
 * Sync momo's resolved provider config into Pi's agent-directory files
 * (auth.json / models.json / settings.json). No-op when momo has no usable
 * config — Pi then falls back to /login and provider-native env vars.
 * Set MOMO_PI_CONFIG_SYNC=false to disable.
 */
export async function syncMomoConfigToPi(agentDir: string): Promise<PiSyncResult> {
  try {
    if (process.env.MOMO_PI_CONFIG_SYNC === "false") return { synced: false }

    const config = await resolveProviderConfig()
    if (!config) return { synced: false }

    const builtinBaseUrl = PI_BUILTIN_DEFAULT_BASE_URLS[config.providerName]
    const isBuiltin = Boolean(builtinBaseUrl) && sameEndpoint(config.baseUrl, builtinBaseUrl)
    if (!isBuiltin && !config.baseUrl) return { synced: false }

    const api = config.providerName === "anthropic" ? "anthropic-messages" : "openai-completions"
    const providerId = isBuiltin ? config.providerName : MOMO_PROVIDER_ID

    fs.mkdirSync(agentDir, { recursive: true })

    // auth.json — credential for Pi built-in providers. Existing OAuth
    // entries (type !== "api_key") always win over a momo-configured key.
    if (isBuiltin) {
      mutateJsonFile<Record<string, PiAuthEntry>>(path.join(agentDir, "auth.json"), (auth) => {
        const existing = auth[config.providerName]
        if (existing && existing.type !== "api_key") return auth
        return { ...auth, [config.providerName]: { type: "api_key", key: config.apiKey } }
      })
    }

    // models.json — declare the model (and the endpoint for non-built-ins)
    // so the synced selection exists in Pi's /model catalog.
    mutateJsonFile<PiModelsFile>(path.join(agentDir, "models.json"), (models) => {
      const providers: Record<string, PiProviderEntry> = { ...(models.providers || {}) }
      if (isBuiltin) {
        const entry: PiProviderEntry = { ...(providers[config.providerName] || {}) }
        const rest = (entry.models || []).filter((m) => m?.id !== config.model)
        entry.models = [...rest, { id: config.model }]
        providers[config.providerName] = entry
      } else {
        providers[MOMO_PROVIDER_ID] = {
          baseUrl: config.baseUrl.replace(/\/+$/, ""),
          api,
          apiKey: config.apiKey,
          models: [{ id: config.model }],
        }
      }
      return { ...models, providers }
    })

    // settings.json — momo config is the source of truth for momo's agent
    // directory (defaultModel is a bare model ID, see src/test/pi-cli.test.ts).
    mutateJsonFile<Record<string, unknown>>(path.join(agentDir, "settings.json"), (settings) => ({
      ...settings,
      defaultProvider: providerId,
      defaultModel: config.model,
    }))

    return { synced: true, provider: config.providerName, model: config.model }
  } catch {
    return { synced: false }
  }
}

/** True when both URLs point at the same endpoint (trailing slashes ignored). */
function sameEndpoint(a: string, b: string | undefined): boolean {
  if (!b) return false
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "")
}

/** Read → transform → write a JSON file in place. Best-effort, never throws. */
function mutateJsonFile<T extends object>(file: string, mutate: (current: T) => T): void {
  let current = {} as T
  try {
    if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, "utf-8")) as T
  } catch {
    current = {} as T
  }
  try {
    fs.writeFileSync(file, JSON.stringify(mutate(current), null, 2) + "\n", "utf-8")
  } catch {
    // A failed write must never break the runtime.
  }
}
