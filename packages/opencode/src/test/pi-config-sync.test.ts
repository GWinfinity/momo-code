import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import fs from "fs"
import os from "os"
import path from "path"
import { syncMomoConfigToPi } from "../pi-config-sync.js"

describe("pi-config-sync", () => {
  let tmpDir: string
  let agentDir: string
  let originalHomedir: typeof os.homedir
  const savedEnv: Record<string, string | undefined> = {}
  const ENV_KEYS = [
    "MOMO_API_KEY",
    "MOMO_PROVIDER",
    "MOMO_MODEL",
    "MOMO_BASE_URL",
    "MOMO_ANTHROPIC_API_KEY",
    "MOMO_DEEPSEEK_API_KEY",
    "MOMO_CUSTOM_BASE_URL",
    "MOMO_CUSTOM_MODEL",
    "MOMO_PI_CONFIG_SYNC",
    "MOMO_NO_CC_SWITCH",
    "MOMO_CC_SWITCH_INHERIT",
  ]

  const momoJsonc = () => path.join(agentDir, "momo.jsonc")
  const authJson = () => path.join(agentDir, "auth.json")
  const modelsJson = () => path.join(agentDir, "models.json")
  const settingsJson = () => path.join(agentDir, "settings.json")
  const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8"))

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-pi-sync-"))
    agentDir = path.join(tmpDir, ".momo")
    fs.mkdirSync(agentDir, { recursive: true })
    originalHomedir = os.homedir
    os.homedir = () => tmpDir
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  after(() => {
    os.homedir = originalHomedir
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key]
      else delete process.env[key]
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("no-ops when momo has no provider config", async () => {
    const result = await syncMomoConfigToPi(agentDir)
    assert.strictEqual(result.synced, false)
    assert.ok(!fs.existsSync(authJson()))
    assert.ok(!fs.existsSync(modelsJson()))
    assert.ok(!fs.existsSync(settingsJson()))
  })

  it("no-ops when MOMO_PI_CONFIG_SYNC=false even with config present", async () => {
    process.env.MOMO_PI_CONFIG_SYNC = "false"
    fs.writeFileSync(momoJsonc(), JSON.stringify({
      provider: "deepseek",
      providers: { deepseek: { apiKey: "sk-ds" } },
    }))
    const result = await syncMomoConfigToPi(agentDir)
    assert.strictEqual(result.synced, false)
    assert.ok(!fs.existsSync(authJson()))
    fs.rmSync(momoJsonc())
    delete process.env.MOMO_PI_CONFIG_SYNC
  })

  it("syncs a built-in provider from momo.jsonc into auth/models/settings", async () => {
    fs.writeFileSync(momoJsonc(), JSON.stringify({
      provider: "deepseek",
      providers: { deepseek: { apiKey: "sk-ds" } },
    }))
    const result = await syncMomoConfigToPi(agentDir)
    assert.strictEqual(result.synced, true)
    assert.strictEqual(result.provider, "deepseek")
    assert.strictEqual(result.model, "deepseek-chat")

    const auth = readJson(authJson())
    assert.deepStrictEqual(auth.deepseek, { type: "api_key", key: "sk-ds" })

    const settings = readJson(settingsJson())
    assert.strictEqual(settings.defaultProvider, "deepseek")
    assert.strictEqual(settings.defaultModel, "deepseek-chat")

    const models = readJson(modelsJson())
    assert.ok(models.providers.deepseek.models.some((m: { id: string }) => m.id === "deepseek-chat"))
    assert.strictEqual(models.providers.deepseek.baseUrl, undefined)
  })

  it("routes a custom relay endpoint through the momo provider slot", async () => {
    fs.rmSync(momoJsonc(), { force: true })
    process.env.MOMO_API_KEY = "sk-relay"
    process.env.MOMO_PROVIDER = "custom"
    process.env.MOMO_CUSTOM_BASE_URL = "http://relay.local/v1/"
    process.env.MOMO_CUSTOM_MODEL = "my-model"

    const result = await syncMomoConfigToPi(agentDir)
    assert.strictEqual(result.synced, true)

    const models = readJson(modelsJson())
    assert.deepStrictEqual(models.providers.momo, {
      baseUrl: "http://relay.local/v1",
      api: "openai-completions",
      apiKey: "sk-relay",
      models: [{ id: "my-model" }],
    })
    const settings = readJson(settingsJson())
    assert.strictEqual(settings.defaultProvider, "momo")
    assert.strictEqual(settings.defaultModel, "my-model")
    // Custom endpoints carry the key in models.json; auth.json keeps only
    // the deepseek entry written by the previous test.
    const auth = readJson(authJson())
    assert.deepStrictEqual(Object.keys(auth), ["deepseek"])

    delete process.env.MOMO_API_KEY
    delete process.env.MOMO_PROVIDER
    delete process.env.MOMO_CUSTOM_BASE_URL
    delete process.env.MOMO_CUSTOM_MODEL
  })

  it("uses anthropic-messages for anthropic-compatible relays", async () => {
    process.env.MOMO_API_KEY = "sk-relay"
    process.env.MOMO_PROVIDER = "anthropic"
    process.env.MOMO_BASE_URL = "https://relay.local/anthropic"

    await syncMomoConfigToPi(agentDir)
    const models = readJson(modelsJson())
    assert.strictEqual(models.providers.momo.api, "anthropic-messages")
    assert.strictEqual(models.providers.momo.baseUrl, "https://relay.local/anthropic")

    delete process.env.MOMO_API_KEY
    delete process.env.MOMO_PROVIDER
    delete process.env.MOMO_BASE_URL
  })

  it("prefers provider-specific env keys over the config file", async () => {
    fs.writeFileSync(momoJsonc(), JSON.stringify({
      provider: "anthropic",
      providers: { anthropic: { apiKey: "sk-from-file" } },
    }))
    process.env.MOMO_ANTHROPIC_API_KEY = "sk-from-env"

    await syncMomoConfigToPi(agentDir)
    const auth = readJson(authJson())
    assert.strictEqual(auth.anthropic.key, "sk-from-env")

    delete process.env.MOMO_ANTHROPIC_API_KEY
  })

  it("never clobbers an existing OAuth credential", async () => {
    fs.writeFileSync(authJson(), JSON.stringify({
      anthropic: { type: "oauth", access: "tok" },
    }))
    await syncMomoConfigToPi(agentDir)
    const auth = readJson(authJson())
    assert.strictEqual(auth.anthropic.type, "oauth")
    assert.strictEqual(auth.anthropic.access, "tok")
  })

  it("merges into models.json without dropping other providers", async () => {
    fs.writeFileSync(modelsJson(), JSON.stringify({
      providers: {
        ollama: {
          baseUrl: "http://localhost:11434/v1",
          api: "openai-completions",
          apiKey: "ollama",
          models: [{ id: "qwen2.5-coder:7b" }],
        },
      },
    }))
    await syncMomoConfigToPi(agentDir)
    const models = readJson(modelsJson())
    assert.deepStrictEqual(models.providers.ollama.models, [{ id: "qwen2.5-coder:7b" }])
    assert.ok(models.providers.anthropic.models.some((m: { id: string }) => m.id === "claude-sonnet-4-20250514"))
  })
})
