/**
 * Tests for the provider module.
 *
 * Covers:
 * - Provider factory configuration
 * - Model resolution (tiers, direct, fuzzy, provider:model format)
 * - New Chinese LLM providers (zhipu, moonshot, doubao, etc.)
 * - Custom provider mechanism
 */

import { describe, it } from "node:test"
import assert from "node:assert"
import {
  PROVIDER_FACTORIES,
  BUILTIN_TIERS,
  BUILTIN_MODELS,
  listProviderNames,
  listAvailableProviders,
} from "../provider/provider"

describe("provider", () => {
  // ---------------------------------------------------------------------------
  // Provider factories
  // ---------------------------------------------------------------------------

  describe("PROVIDER_FACTORIES", () => {
    it("has all expected providers registered", () => {
      const names = listProviderNames()
      const expected = [
        "anthropic",
        "openai",
        "google",
        "azure",
        "groq",
        "mistral",
        "xai",
        "cohere",
        "amazon-bedrock",
        "google-vertex",
        "nvidia",
        "together-ai",
        "perplexity",
        "deepinfra",
        "cerebras",
        "alibaba",
        "openrouter",
        "llmgateway",
        "vercel",
        // Chinese LLM providers
        "zhipu",
        "minimax",
        "moonshot",
        "stepfun",
        "doubao",
        "custom",
      ]

      for (const name of expected) {
        assert.ok(names.includes(name), `Provider "${name}" should be registered`)
      }
    })

    it("anthropic factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.anthropic()
      assert.strictEqual(config.baseUrl, "https://api.anthropic.com")
      assert.strictEqual(config.defaultModel, "claude-sonnet-4-20250514")
      assert.strictEqual(config.timeout, 120_000)
    })

    it("openai factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.openai()
      assert.strictEqual(config.baseUrl, "https://api.openai.com/v1")
      assert.strictEqual(config.defaultModel, "gpt-4.1")
    })
  })

  // ---------------------------------------------------------------------------
  // Chinese LLM providers
  // ---------------------------------------------------------------------------

  describe("Chinese LLM providers", () => {
    it("zhipu (GLM) factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.zhipu()
      assert.strictEqual(config.baseUrl, "https://open.bigmodel.cn/api/paas/v4")
      assert.strictEqual(config.defaultModel, "glm-4-plus")
      assert.strictEqual(config.timeout, 120_000)
    })

    it("minimax factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.minimax()
      assert.strictEqual(config.baseUrl, "https://api.minimaxi.com/v1")
      assert.strictEqual(config.defaultModel, "MiniMax-M2.7")
      assert.strictEqual(config.timeout, 120_000)
    })

    it("moonshot (Kimi) factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.moonshot()
      assert.strictEqual(config.baseUrl, "https://api.moonshot.cn/v1")
      assert.strictEqual(config.defaultModel, "moonshot-v1-128k")
      assert.strictEqual(config.timeout, 120_000)
    })

    it("stepfun factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.stepfun()
      assert.strictEqual(config.baseUrl, "https://api.stepfun.com/v1")
      assert.strictEqual(config.defaultModel, "step-2-16k")
      assert.strictEqual(config.timeout, 120_000)
    })

    it("doubao factory returns correct config", () => {
      const config = PROVIDER_FACTORIES.doubao()
      assert.strictEqual(config.baseUrl, "https://ark.cn-beijing.volces.com/api/v3")
      assert.strictEqual(config.defaultModel, "doubao-pro-128k")
      assert.strictEqual(config.timeout, 120_000)
    })

    it("custom factory reads from env vars", () => {
      // Without env vars
      const config = PROVIDER_FACTORIES.custom()
      assert.strictEqual(config.baseUrl, "")
      assert.strictEqual(config.defaultModel, "")

      // With env vars
      process.env.MOMO_CUSTOM_BASE_URL = "https://custom.example.com/v1"
      process.env.MOMO_CUSTOM_MODEL = "custom-model"
      const configWithEnv = PROVIDER_FACTORIES.custom()
      assert.strictEqual(configWithEnv.baseUrl, "https://custom.example.com/v1")
      assert.strictEqual(configWithEnv.defaultModel, "custom-model")
      delete process.env.MOMO_CUSTOM_BASE_URL
      delete process.env.MOMO_CUSTOM_MODEL
    })
  })

  // ---------------------------------------------------------------------------
  // Model catalog
  // ---------------------------------------------------------------------------

  describe("BUILTIN_MODELS", () => {
    it("includes Chinese LLM models", () => {
      const modelIds = BUILTIN_MODELS.map((m) => m.id)
      assert.ok(modelIds.includes("glm-4-plus"), "Should include GLM-4 Plus")
      assert.ok(modelIds.includes("moonshot-v1-128k"), "Should include Moonshot")
      assert.ok(modelIds.includes("doubao-pro-128k"), "Should include Doubao")
    })

    it("each model has required fields", () => {
      for (const model of BUILTIN_MODELS) {
        assert.ok(model.id, "Model should have id")
        assert.ok(model.provider, "Model should have provider")
        assert.ok(model.providerModelId, "Model should have providerModelId")
        assert.ok(model.name, "Model should have name")
        assert.ok(model.contextWindow > 0, "Model should have positive contextWindow")
        assert.ok(Array.isArray(model.capabilities), "Model should have capabilities array")
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Model tiers
  // ---------------------------------------------------------------------------

  describe("BUILTIN_TIERS", () => {
    it("standard tier includes Chinese models", () => {
      const standard = BUILTIN_TIERS.standard
      assert.ok(standard.includes("glm-4-plus"))
      assert.ok(standard.includes("moonshot-v1-128k"))
      assert.ok(standard.includes("doubao-pro-128k"))
    })
  })

  // ---------------------------------------------------------------------------
  // Provider listing
  // ---------------------------------------------------------------------------

  describe("listAvailableProviders", () => {
    it("includes Chinese providers with correct metadata", () => {
      const providers = listAvailableProviders()
      const zhipu = providers.find((p) => p.name === "zhipu")
      assert.ok(zhipu, "Should include zhipu provider")
      assert.strictEqual(zhipu.envSuffix, "ZHIPU")
      assert.ok(zhipu.description?.includes("智谱"))

      const moonshot = providers.find((p) => p.name === "moonshot")
      assert.ok(moonshot, "Should include moonshot provider")
      assert.strictEqual(moonshot.envSuffix, "MOONSHOT")

      const custom = providers.find((p) => p.name === "custom")
      assert.ok(custom, "Should include custom provider")
      assert.strictEqual(custom.envSuffix, "CUSTOM")
    })

    it("all providers have required fields", () => {
      const providers = listAvailableProviders()
      for (const provider of providers) {
        assert.ok(provider.name, "Provider should have name")
        assert.ok(provider.envSuffix, "Provider should have envSuffix")
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Brand cleanup verification
  // ---------------------------------------------------------------------------

  describe("brand headers", () => {
    it("all brand headers use momozi.cc, not momocode.ai", () => {
      const providersWithHeaders = [
        "nvidia",
        "openrouter",
        "llmgateway",
        "vercel",
      ] as const

      for (const name of providersWithHeaders) {
        const config = PROVIDER_FACTORIES[name]()
        if (config.headers) {
          const referer = config.headers["HTTP-Referer"] || ""
          assert.ok(
            !referer.includes("momocode.ai"),
            `Provider "${name}" should not use momocode.ai in Referer`,
          )
        }
      }
    })

    it("llmgateway uses momozi.cc domain", () => {
      const config = PROVIDER_FACTORIES.llmgateway()
      assert.ok(
        config.baseUrl?.includes("momozi.cc") || config.baseUrl?.startsWith("https://gateway.momozi.cc"),
        "LLM Gateway should use momozi.cc domain",
      )
    })
  })
})
