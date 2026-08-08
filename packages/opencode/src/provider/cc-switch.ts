/**
 * CC Switch integration for momo Code.
 *
 * CC Switch (github.com/farion1231/cc-switch) is a desktop GUI for managing
 * provider configurations for Claude Code, Codex, Gemini CLI, etc. This module
 * reads its active provider for the "claude" app type and exposes it as a
 * normal momo provider config so users can switch providers in CC Switch and
 * have momo follow automatically.
 *
 * Resolution strategy:
 *   1. Read ~/.cc-switch/settings.json to find the current provider ID.
 *   2. Query ~/.cc-switch/cc-switch.db (SQLite) for that provider.
 *   3. If SQLite is unavailable, fall back to ~/.claude/settings.json, which
 *      CC Switch rewrites with the active provider's ANTHROPIC_* env vars.
 */

import fs from "fs"
import os from "os"
import path from "path"

/**
 * Normalized provider config extracted from CC Switch.
 */
export interface CcSwitchProvider {
  /** CC Switch provider UUID. */
  readonly id: string
  /** Display name from CC Switch. */
  readonly name: string
  /** App type, e.g. "claude". */
  readonly appType: string
  /** momo provider name to use (CC Switch/Claude Code is Anthropic protocol). */
  readonly providerName: string
  /** API key / auth token. */
  readonly apiKey: string
  /** Base URL override. */
  readonly baseUrl?: string
  /** Default model if specified. */
  readonly model?: string
}

/** Parsed CC Switch settings.json. */
export interface CcSwitchSettings {
  readonly currentProviderClaude?: string
  readonly currentProviderCodex?: string
  readonly currentProviderGemini?: string
}

/** Raw row from the CC Switch providers table. */
interface CcSwitchProviderRow {
  readonly id: string
  readonly app_type: string
  readonly name: string
  readonly settings_config: string
  readonly is_current: number | boolean
}

/** Returns the CC Switch config directory (usually ~/.cc-switch). */
export function getCcSwitchDir(): string {
  return path.join(os.homedir(), ".cc-switch")
}

/** Check whether CC Switch inheritance is enabled via env/config. */
export function isCcSwitchInheritanceEnabled(): boolean {
  if (process.env.MOMO_NO_CC_SWITCH === "true") return false
  if (process.env.MOMO_CC_SWITCH_INHERIT === "false") return false
  return true
}

/** Load and parse ~/.cc-switch/settings.json. */
export function loadCcSwitchSettings(): CcSwitchSettings | null {
  const settingsPath = path.join(getCcSwitchDir(), "settings.json")
  if (!fs.existsSync(settingsPath)) return null
  try {
    const content = fs.readFileSync(settingsPath, "utf-8")
    return JSON.parse(content) as CcSwitchSettings
  } catch {
    return null
  }
}

/**
 * Resolve the active CC Switch provider for the given app type.
 * Defaults to "claude" because that is the Anthropic-compatible protocol
 * that momo can consume directly.
 */
export async function loadActiveCcSwitchProvider(
  appType = "claude",
): Promise<CcSwitchProvider | null> {
  if (!isCcSwitchInheritanceEnabled()) return null

  const settings = loadCcSwitchSettings()
  const currentId = settings
    ? settings[`currentProvider${capitalize(appType)}` as keyof CcSwitchSettings]
    : undefined

  if (typeof currentId !== "string") {
    // No explicit current provider in settings; try the is_current flag in DB.
    const fromDb = await loadProviderFromDb(appType)
    if (fromDb) return normalizeCcSwitchProvider(fromDb)
    return loadActiveProviderFromClaudeSettings(appType)
  }

  // Try to load the specific provider ID from the DB.
  const fromDb = await loadProviderFromDb(appType, currentId)
  if (fromDb) return normalizeCcSwitchProvider(fromDb)

  // Fallback to Claude Code settings (rewritten by CC Switch).
  return loadActiveProviderFromClaudeSettings(appType)
}

/**
 * Synchronous version that does not touch SQLite; it only reads
 * ~/.claude/settings.json. Useful for contexts where async is not available.
 */
export function loadActiveCcSwitchProviderSync(
  appType = "claude",
): CcSwitchProvider | null {
  if (!isCcSwitchInheritanceEnabled()) return null
  return loadActiveProviderFromClaudeSettings(appType)
}

/**
 * Normalize a raw CC Switch provider row into momo provider config.
 * Returns null if the row does not contain a usable API key.
 */
export function normalizeCcSwitchProvider(
  row: CcSwitchProviderRow,
): CcSwitchProvider | null {
  let config: { env?: Record<string, string> } = {}
  try {
    config = JSON.parse(row.settings_config) as { env?: Record<string, string> }
  } catch {
    return null
  }

  const env = config.env || {}
  const apiKey = env.ANTHROPIC_AUTH_TOKEN
  if (!apiKey) return null

  const baseUrl = env.ANTHROPIC_BASE_URL
  const model =
    env.ANTHROPIC_MODEL ||
    env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
    env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL

  return {
    id: row.id,
    name: row.name,
    appType: row.app_type,
    providerName: "anthropic",
    apiKey,
    baseUrl,
    model,
  }
}

/** Internal: try to read the active provider from the SQLite DB. */
async function loadProviderFromDb(
  appType: string,
  providerId?: string,
): Promise<CcSwitchProviderRow | null> {
  const dbPath = path.join(getCcSwitchDir(), "cc-switch.db")
  if (!fs.existsSync(dbPath)) return null

  // Try Bun's built-in SQLite first (compiled binary / Bun runtime).
  try {
    const bunSqlite = "bun:sqlite"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Database }: any = await import(bunSqlite)
    const db = new Database(dbPath, { readonly: true })
    try {
      let sql =
        "SELECT id, app_type, name, settings_config, is_current FROM providers WHERE app_type = ?"
      const params: (string | number)[] = [appType]
      if (providerId) {
        sql += " AND id = ?"
        params.push(providerId)
      } else {
        sql += " AND is_current = 1"
      }
      const stmt = db.query(sql)
      const row = stmt.get(...params) as CcSwitchProviderRow | undefined
      return row || null
    } finally {
      db.close()
    }
  } catch {
    // fallthrough
  }

  // Try better-sqlite3 for Node runtimes.
  try {
    const betterSqlite = "better-sqlite3"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { default: Database }: any = await import(betterSqlite)
    const db = new Database(dbPath, { readonly: true })
    try {
      if (providerId) {
        const stmt = db.prepare(
          "SELECT id, app_type, name, settings_config, is_current FROM providers WHERE app_type = ? AND id = ?",
        )
        return (stmt.get(appType, providerId) as CcSwitchProviderRow) || null
      }
      const stmt = db.prepare(
        "SELECT id, app_type, name, settings_config, is_current FROM providers WHERE app_type = ? AND is_current = 1",
      )
      return (stmt.get(appType) as CcSwitchProviderRow) || null
    } finally {
      db.close()
    }
  } catch {
    // fallthrough
  }

  return null
}

/** Internal: fall back to ~/.claude/settings.json (rewritten by CC Switch). */
function loadActiveProviderFromClaudeSettings(
  appType: string,
): CcSwitchProvider | null {
  if (appType !== "claude") return null

  const claudeSettingsPath = path.join(os.homedir(), ".claude", "settings.json")
  if (!fs.existsSync(claudeSettingsPath)) return null

  try {
    const content = JSON.parse(
      fs.readFileSync(claudeSettingsPath, "utf-8"),
    ) as { env?: Record<string, string> }
    const env = content.env || {}
    const apiKey = env.ANTHROPIC_AUTH_TOKEN
    if (!apiKey) return null

    return {
      id: "cc-switch-fallback",
      name: "CC Switch (via Claude Code settings)",
      appType: "claude",
      providerName: "anthropic",
      apiKey,
      baseUrl: env.ANTHROPIC_BASE_URL,
      model:
        env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    }
  } catch {
    return null
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
