import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import fs from "fs"
import os from "os"
import path from "path"
import {
  getCcSwitchDir,
  isCcSwitchInheritanceEnabled,
  loadActiveCcSwitchProviderSync,
  loadCcSwitchSettings,
  normalizeCcSwitchProvider,
} from "../provider/cc-switch.js"

describe("cc-switch integration", () => {
  let tmpDir: string
  let originalHomedir: typeof os.homedir
  let originalNoCcSwitch: string | undefined
  let originalCcSwitchInherit: string | undefined

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-cc-switch-"))
    originalHomedir = os.homedir
    os.homedir = () => tmpDir
    originalNoCcSwitch = process.env.MOMO_NO_CC_SWITCH
    originalCcSwitchInherit = process.env.MOMO_CC_SWITCH_INHERIT
    delete process.env.MOMO_NO_CC_SWITCH
    delete process.env.MOMO_CC_SWITCH_INHERIT
  })

  after(() => {
    os.homedir = originalHomedir
    if (originalNoCcSwitch !== undefined) {
      process.env.MOMO_NO_CC_SWITCH = originalNoCcSwitch
    } else {
      delete process.env.MOMO_NO_CC_SWITCH
    }
    if (originalCcSwitchInherit !== undefined) {
      process.env.MOMO_CC_SWITCH_INHERIT = originalCcSwitchInherit
    } else {
      delete process.env.MOMO_CC_SWITCH_INHERIT
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("getCcSwitchDir points to ~/.cc-switch under mocked home", () => {
    assert.strictEqual(getCcSwitchDir(), path.join(tmpDir, ".cc-switch"))
  })

  it("isCcSwitchInheritanceEnabled defaults to true and respects env toggles", () => {
    delete process.env.MOMO_NO_CC_SWITCH
    delete process.env.MOMO_CC_SWITCH_INHERIT
    assert.strictEqual(isCcSwitchInheritanceEnabled(), true)

    process.env.MOMO_NO_CC_SWITCH = "true"
    assert.strictEqual(isCcSwitchInheritanceEnabled(), false)
    delete process.env.MOMO_NO_CC_SWITCH

    process.env.MOMO_CC_SWITCH_INHERIT = "false"
    assert.strictEqual(isCcSwitchInheritanceEnabled(), false)
    delete process.env.MOMO_CC_SWITCH_INHERIT
  })

  it("normalizeCcSwitchProvider extracts Anthropic env vars", () => {
    const provider = normalizeCcSwitchProvider({
      id: "uuid",
      app_type: "claude",
      name: "Kimi For Coding",
      settings_config: JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: "sk-kimi",
          ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
          ANTHROPIC_MODEL: "kimi-model",
        },
      }),
      is_current: 1,
    })
    assert.ok(provider)
    assert.strictEqual(provider!.providerName, "anthropic")
    assert.strictEqual(provider!.apiKey, "sk-kimi")
    assert.strictEqual(provider!.baseUrl, "https://api.kimi.com/coding/")
    assert.strictEqual(provider!.model, "kimi-model")
  })

  it("normalizeCcSwitchProvider returns null when API key is missing", () => {
    const provider = normalizeCcSwitchProvider({
      id: "uuid",
      app_type: "claude",
      name: "Broken",
      settings_config: JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://x" } }),
      is_current: 1,
    })
    assert.strictEqual(provider, null)
  })

  it("loadCcSwitchSettings parses currentProviderClaude", () => {
    const ccDir = path.join(tmpDir, ".cc-switch")
    fs.mkdirSync(ccDir, { recursive: true })
    fs.writeFileSync(
      path.join(ccDir, "settings.json"),
      JSON.stringify({ currentProviderClaude: "abc-123" }),
    )
    const settings = loadCcSwitchSettings()
    assert.ok(settings)
    assert.strictEqual(settings!.currentProviderClaude, "abc-123")
  })

  it("loadActiveCcSwitchProviderSync falls back to Claude Code settings", () => {
    const claudeDir = path.join(tmpDir, ".claude")
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: "sk-fallback",
          ANTHROPIC_BASE_URL: "http://localhost:8080",
        },
      }),
    )
    const provider = loadActiveCcSwitchProviderSync("claude")
    assert.ok(provider)
    assert.strictEqual(provider!.apiKey, "sk-fallback")
    assert.strictEqual(provider!.baseUrl, "http://localhost:8080")
  })

  it("loadActiveCcSwitchProviderSync returns null when disabled", () => {
    process.env.MOMO_NO_CC_SWITCH = "true"
    const provider = loadActiveCcSwitchProviderSync("claude")
    assert.strictEqual(provider, null)
    delete process.env.MOMO_NO_CC_SWITCH
  })
})
