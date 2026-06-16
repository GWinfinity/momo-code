/**
 * Provider layer for momo Code.
 *
 * This is the central module for LLM provider integration. It provides:
 * - 15+ provider factory functions (anthropic, openai, google, openrouter, etc.)
 * - Model tier routing (ultra/standard/lite) with zero-config selection
 * - momo Router gateway integration with brand header injection
 * - Chunk timeout optimization for cold-start models
 * - Claude Code ecosystem inheritance (config + prompts from .claude/)
 * - Fuzzy model matching and alias resolution
 * - SSE streaming with timeout watchdog
 *
 * Architecture:
 * - Uses Effect framework for composable, typed effects
 * - Compatible with AI SDK provider interface
 * - OpenAI/OpenRouter compatible gateway support
 */
import os from "os";
import path from "path";
import fs from "fs";
import { Effect, Ref } from "effect";
import fuzzysort from "fuzzysort";
import { Config } from "../config/config.js";
import { Env } from "../env.js";
import { Auth } from "../auth.js";
import { ProviderTransform } from "./transform.js";
import { ModelStatus } from "./model-status.js";
import { InstanceState } from "../effect/instance-state.js";
import { ProviderError, ChunkTimeoutError, ModelResolutionError, ProviderInitializationError, } from "./error.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default timeout for OpenAI-compatible header reads (10s). */
export const OPENAI_HEADER_TIMEOUT_DEFAULT = 10_000;
/**
 * Default chunk timeout for streaming responses (8 minutes).
 * This accommodates cold-start TTFT for momo-coder-pro and other large models.
 */
export const DEFAULT_CHUNK_TIMEOUT = 480_000;
/** Tier fallback order when checking availability. */
const TIER_FALLBACK_ORDER = ["ultra", "standard", "lite"];
// ---------------------------------------------------------------------------
// Built-in model tiers (zero-config selection)
// ---------------------------------------------------------------------------
/**
 * Built-in model tiers map human-friendly names to model IDs.
 * Each tier lists models in priority order (first available wins).
 */
export const BUILTIN_TIERS = {
    ultra: [
        "claude-sonnet-4",
        "gpt-5",
        "gemini-2.5-pro",
        "momo-coder-ultra",
    ],
    standard: [
        "claude-sonnet-4",
        "gpt-4.1",
        "gemini-2.5-flash",
        "momo-coder-pro",
    ],
    lite: [
        "claude-haiku",
        "gpt-4.1-mini",
        "gemini-2.5-flash-lite",
        "momo-coder-lite",
    ],
};
/**
 * Built-in model catalog with known models.
 * These are merged with remote catalog data.
 */
export const BUILTIN_MODELS = [
    // Ultra tier
    {
        id: "claude-sonnet-4",
        providerModelId: "claude-sonnet-4-20250514",
        provider: "anthropic",
        name: "Claude Sonnet 4",
        status: ModelStatus.Available,
        contextWindow: 200_000,
        capabilities: ["coding", "analysis", "writing"],
        supportsTools: true,
        supportsVision: true,
        costTier: "high",
    },
    {
        id: "gpt-5",
        providerModelId: "gpt-5",
        provider: "openai",
        name: "GPT-5",
        status: ModelStatus.Available,
        contextWindow: 128_000,
        capabilities: ["coding", "analysis", "writing"],
        supportsTools: true,
        supportsVision: true,
        costTier: "high",
    },
    {
        id: "gemini-2.5-pro",
        providerModelId: "gemini-2.5-pro-preview-05-06",
        provider: "google",
        name: "Gemini 2.5 Pro",
        status: ModelStatus.Available,
        contextWindow: 1_000_000,
        capabilities: ["coding", "analysis", "writing", "long-context"],
        supportsTools: true,
        supportsVision: true,
        costTier: "high",
    },
    {
        id: "momo-coder-ultra",
        providerModelId: "momo-coder-ultra",
        provider: "llmgateway",
        name: "momo Coder Ultra",
        status: ModelStatus.Available,
        contextWindow: 256_000,
        capabilities: ["coding", "analysis", "specialized"],
        supportsTools: true,
        supportsVision: true,
        costTier: "high",
    },
    // Standard tier
    {
        id: "claude-sonnet-4",
        providerModelId: "claude-sonnet-4-20250514",
        provider: "anthropic",
        name: "Claude Sonnet 4",
        status: ModelStatus.Available,
        contextWindow: 200_000,
        capabilities: ["coding", "analysis", "writing"],
        supportsTools: true,
        supportsVision: true,
        costTier: "medium",
    },
    {
        id: "gpt-4.1",
        providerModelId: "gpt-4.1",
        provider: "openai",
        name: "GPT-4.1",
        status: ModelStatus.Available,
        contextWindow: 1_047_576,
        capabilities: ["coding", "analysis", "writing"],
        supportsTools: true,
        supportsVision: true,
        costTier: "medium",
    },
    {
        id: "gemini-2.5-flash",
        providerModelId: "gemini-2.5-flash-preview-04-17",
        provider: "google",
        name: "Gemini 2.5 Flash",
        status: ModelStatus.Available,
        contextWindow: 1_000_000,
        capabilities: ["coding", "analysis", "fast"],
        supportsTools: true,
        supportsVision: true,
        costTier: "medium",
    },
    {
        id: "momo-coder-pro",
        providerModelId: "momo-coder-pro",
        provider: "llmgateway",
        name: "momo Coder Pro",
        status: ModelStatus.Available,
        contextWindow: 256_000,
        capabilities: ["coding", "analysis", "specialized"],
        supportsTools: true,
        supportsVision: true,
        costTier: "medium",
    },
    // Lite tier
    {
        id: "claude-haiku",
        providerModelId: "claude-3-haiku-20240307",
        provider: "anthropic",
        name: "Claude Haiku",
        status: ModelStatus.Available,
        contextWindow: 200_000,
        capabilities: ["coding", "fast", "lightweight"],
        supportsTools: true,
        supportsVision: false,
        costTier: "low",
    },
    {
        id: "gpt-4.1-mini",
        providerModelId: "gpt-4.1-mini",
        provider: "openai",
        name: "GPT-4.1 Mini",
        status: ModelStatus.Available,
        contextWindow: 1_047_576,
        capabilities: ["coding", "fast", "lightweight"],
        supportsTools: true,
        supportsVision: true,
        costTier: "low",
    },
    {
        id: "gemini-2.5-flash-lite",
        providerModelId: "gemini-2.5-flash-lite-preview-06-17",
        provider: "google",
        name: "Gemini 2.5 Flash Lite",
        status: ModelStatus.Available,
        contextWindow: 1_000_000,
        capabilities: ["coding", "fast", "lightweight"],
        supportsTools: true,
        supportsVision: true,
        costTier: "low",
    },
    {
        id: "momo-coder-lite",
        providerModelId: "momo-coder-lite",
        provider: "llmgateway",
        name: "momo Coder Lite",
        status: ModelStatus.Available,
        contextWindow: 128_000,
        capabilities: ["coding", "fast", "lightweight"],
        supportsTools: true,
        supportsVision: false,
        costTier: "low",
    },
];
/**
 * Build a lookup map from model ID to ModelGroupEntry.
 */
function buildModelMap() {
    const map = new Map();
    for (const model of BUILTIN_MODELS) {
        map.set(model.id, model);
        // Also map provider-specific ID
        map.set(`${model.provider}:${model.providerModelId}`, model);
    }
    return map;
}
/** Cached model lookup map. */
const modelMap = buildModelMap();
/**
 * Resolve Claude Code inheritance config from environment and user config.
 */
export function resolveClaudeCodeInheritance() {
    const envEnabled = process.env.MOMO_CLAUDE_CODE_INHERIT;
    const envNoPrompts = process.env.MOMO_NO_CLAUDE_PROMPTS;
    const envNoSettings = process.env.MOMO_NO_CLAUDE_SETTINGS;
    // Master switch: default ON, can be disabled by setting MOMO_CLAUDE_CODE_INHERIT=false
    const enabled = envEnabled !== "false";
    // Individual toggles: default follows master switch
    const settings = enabled && envNoSettings !== "true";
    const prompts = enabled && envNoPrompts !== "true";
    return { enabled, settings, prompts };
}
/**
 * Attempt to load Claude Code settings from ~/.claude/settings.json.
 */
export function loadClaudeCodeSettings() {
    return Effect.gen(function* () {
        const inherit = resolveClaudeCodeInheritance();
        if (!inherit.enabled || !inherit.settings) {
            return null;
        }
        const claudeDir = path.join(os.homedir(), ".claude");
        const settingsPath = path.join(claudeDir, "settings.json");
        const exists = yield* Effect.sync(() => fs.existsSync(settingsPath));
        if (!exists) {
            return null;
        }
        const content = yield* Effect.tryPromise({
            try: () => fs.promises.readFile(settingsPath, "utf-8"),
            catch: () => null,
        });
        if (!content)
            return null;
        try {
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    });
}
/**
 * Find the .claude/prompts directory if inheritance is enabled.
 */
export function findClaudePromptsDir() {
    return Effect.gen(function* () {
        const inherit = resolveClaudeCodeInheritance();
        if (!inherit.enabled || !inherit.prompts) {
            return null;
        }
        const claudePromptsDir = path.join(os.homedir(), ".claude", "prompts");
        const exists = yield* Effect.sync(() => fs.existsSync(claudePromptsDir));
        return exists ? claudePromptsDir : null;
    });
}
// ---------------------------------------------------------------------------
// SSE streaming with timeout watchdog
// ---------------------------------------------------------------------------
/**
 * Wrap a ReadableStream with a per-chunk timeout.
 *
 * This is critical for handling cold-start models (like momo-coder-pro hosted on
 * serverless infrastructure) where the Time-To-First-Token (TTFT) can exceed
 * normal timeouts.
 *
 * @param res - Fetch Response with body to wrap
 * @param ms - Timeout in milliseconds for each chunk read
 * @param ctl - AbortController to signal when timeout fires
 * @returns Transformed Response with timeout-enforced body
 */
export function wrapSSE(res, ms, ctl) {
    if (!res.body)
        return res;
    const reader = res.body.getReader();
    let lastChunkAt = Date.now();
    let timer = null;
    function resetTimer() {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => {
            const elapsed = Date.now() - lastChunkAt;
            if (elapsed >= ms) {
                ctl.abort(new ChunkTimeoutError({
                    message: `SSE chunk timeout after ${elapsed}ms (limit: ${ms}ms)`,
                    timeoutMs: ms,
                }));
            }
        }, ms);
    }
    resetTimer();
    const stream = new ReadableStream({
        async pull(controller) {
            try {
                const result = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => {
                        const t = setTimeout(() => {
                            reject(new ChunkTimeoutError({
                                message: `SSE read timed out after ${ms}ms`,
                                timeoutMs: ms,
                            }));
                        }, ms);
                        ctl.signal.addEventListener("abort", () => {
                            clearTimeout(t);
                            reject(ctl.signal.reason);
                        });
                    }),
                ]);
                if (result.done) {
                    if (timer)
                        clearTimeout(timer);
                    controller.close();
                    return;
                }
                lastChunkAt = Date.now();
                resetTimer();
                controller.enqueue(result.value);
            }
            catch (error) {
                if (timer)
                    clearTimeout(timer);
                controller.error(error);
            }
        },
        cancel() {
            if (timer)
                clearTimeout(timer);
            return reader.cancel();
        },
    });
    return new Response(stream, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    });
}
/**
 * Provider registry mapping provider names to their factory functions.
 */
export const PROVIDER_FACTORIES = {
    /**
     * Anthropic Claude API.
     */
    anthropic: () => ({
        baseUrl: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-20250514",
        timeout: 120_000,
    }),
    /**
     * OpenAI API.
     */
    openai: () => ({
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4.1",
        timeout: 120_000,
    }),
    /**
     * Google Gemini API.
     */
    google: () => ({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        defaultModel: "gemini-2.5-flash-preview-04-17",
        timeout: 120_000,
    }),
    /**
     * Azure OpenAI Service.
     */
    azure: () => ({
        baseUrl: process.env.MOMO_AZURE_BASE_URL || "",
        defaultModel: "gpt-4",
        timeout: 120_000,
        headers: {
            "api-key": process.env.MOMO_AZURE_API_KEY || "",
        },
    }),
    /**
     * Groq API (high-speed inference).
     */
    groq: () => ({
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: "llama-3.1-70b-versatile",
        timeout: 60_000,
    }),
    /**
     * Mistral AI API.
     */
    mistral: () => ({
        baseUrl: "https://api.mistral.ai/v1",
        defaultModel: "mistral-large-latest",
        timeout: 120_000,
    }),
    /**
     * XAI (Grok) API.
     */
    xai: () => ({
        baseUrl: "https://api.x.ai/v1",
        defaultModel: "grok-2",
        timeout: 120_000,
    }),
    /**
     * Cohere API.
     */
    cohere: () => ({
        baseUrl: "https://api.cohere.ai/v1",
        defaultModel: "command-r-plus",
        timeout: 120_000,
    }),
    /**
     * Amazon Bedrock API.
     */
    "amazon-bedrock": () => ({
        baseUrl: `https://bedrock-runtime.${process.env.MOMO_BEDROCK_REGION || "us-east-1"}.amazonaws.com`,
        defaultModel: "anthropic.claude-sonnet-4-20250514-v1:0",
        timeout: 180_000,
    }),
    /**
     * Google Vertex AI.
     */
    "google-vertex": () => ({
        baseUrl: `https://${process.env.MOMO_GOOGLE_VERTEX_REGION || "us-central1"}-aiplatform.googleapis.com/v1`,
        defaultModel: "gemini-2.5-pro-preview-05-06",
        timeout: 180_000,
    }),
    /**
     * NVIDIA NIM API.
     * Injected with momo brand headers.
     */
    nvidia: () => ({
        baseUrl: "https://integrate.api.nvidia.com/v1",
        defaultModel: "meta/llama-3.1-70b-instruct",
        timeout: 120_000,
        headers: {
            "HTTP-Referer": "https://momocode.ai/coder/",
            "X-Title": "momocode",
        },
    }),
    /**
     * Together AI API.
     */
    "together-ai": () => ({
        baseUrl: "https://api.together.xyz/v1",
        defaultModel: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
        timeout: 120_000,
    }),
    /**
     * Perplexity API.
     */
    perplexity: () => ({
        baseUrl: "https://api.perplexity.ai",
        defaultModel: "sonar-pro",
        timeout: 120_000,
    }),
    /**
     * DeepInfra API.
     */
    deepinfra: () => ({
        baseUrl: "https://api.deepinfra.com/v1/openai",
        defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        timeout: 120_000,
    }),
    /**
     * Cerebras API.
     */
    cerebras: () => ({
        baseUrl: "https://api.cerebras.ai/v1",
        defaultModel: "llama-3.1-70b",
        timeout: 60_000,
    }),
    /**
     * Alibaba Cloud (Qwen) API.
     */
    alibaba: () => ({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        defaultModel: "qwen2.5-72b-instruct",
        timeout: 120_000,
    }),
    /**
     * OpenRouter API gateway.
     * Injected with momo brand headers and OpenRouter categories.
     */
    openrouter: () => ({
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "anthropic/claude-sonnet-4",
        timeout: 180_000,
        headers: {
            "HTTP-Referer": "https://momocode.ai/coder/",
            "X-Title": "momocode",
            "X-OpenRouter-Categories": "programming,programming-app,cli-agent",
        },
    }),
    /**
     * momo LLM Gateway (primary provider).
     * Injected with momo brand headers for routing and analytics.
     */
    llmgateway: () => ({
        baseUrl: process.env.MOMO_LLMGATEWAY_URL || "https://gateway.momocode.ai/v1",
        defaultModel: "momo-coder-pro",
        timeout: DEFAULT_CHUNK_TIMEOUT,
        headers: {
            "HTTP-Referer": "https://momocode.ai/coder/",
            "X-Title": "momocode",
            "X-Source": "momocode",
        },
    }),
    /**
     * Vercel AI SDK provider.
     * Injected with momo brand headers.
     */
    vercel: () => ({
        baseUrl: "https://ai-sdk.vercel.ai/v1",
        defaultModel: "gpt-4.1",
        timeout: 120_000,
        headers: {
            "HTTP-Referer": "https://momocode.ai/coder/",
            "X-Title": "momocode",
        },
    }),
};
/**
 * List all available provider names.
 */
export function listProviderNames() {
    return Object.keys(PROVIDER_FACTORIES);
}
/**
 * List available providers with metadata.
 */
export function listAvailableProviders() {
    return [
        { name: "anthropic", envSuffix: "ANTHROPIC", description: "Anthropic Claude models" },
        { name: "openai", envSuffix: "OPENAI", description: "OpenAI GPT models" },
        { name: "google", envSuffix: "GOOGLE", description: "Google Gemini models" },
        { name: "openrouter", envSuffix: "OPENROUTER", description: "OpenRouter model gateway" },
        { name: "llmgateway", envSuffix: "LLMGATEWAY", description: "momo LLM Gateway (recommended)" },
        { name: "groq", envSuffix: "GROQ", description: "Groq fast inference" },
        { name: "mistral", envSuffix: "MISTRAL", description: "Mistral AI models" },
        { name: "xai", envSuffix: "XAI", description: "XAI Grok models" },
        { name: "nvidia", envSuffix: "NVIDIA", description: "NVIDIA NIM models" },
        { name: "azure", envSuffix: "AZURE", description: "Azure OpenAI Service" },
        { name: "amazon-bedrock", envSuffix: "BEDROCK", description: "AWS Bedrock models" },
        { name: "google-vertex", envSuffix: "GOOGLE_VERTEX", description: "Google Vertex AI" },
        { name: "cohere", envSuffix: "COHERE", description: "Cohere models" },
        { name: "together-ai", envSuffix: "TOGETHER_AI", description: "Together AI models" },
        { name: "perplexity", envSuffix: "PERPLEXITY", description: "Perplexity models" },
        { name: "deepinfra", envSuffix: "DEEPINFRA", description: "DeepInfra models" },
        { name: "cerebras", envSuffix: "CEREBRAS", description: "Cerebras models" },
        { name: "alibaba", envSuffix: "ALIBABA", description: "Alibaba Qwen models" },
        { name: "vercel", envSuffix: "VERCEL_AI", description: "Vercel AI SDK" },
    ];
}
// ---------------------------------------------------------------------------
// Model resolution (tiers, aliases, fuzzy matching)
// ---------------------------------------------------------------------------
/**
 * Resolve a tier name to the first available model ID.
 * Checks each model in the tier list and returns the first one whose
 * provider has credentials configured.
 */
export function resolveTierModel(tierName) {
    return Effect.gen(function* () {
        const tierModels = BUILTIN_TIERS[tierName];
        if (!tierModels)
            return null;
        // Get the auth service to check credentials
        const auth = yield* Auth;
        for (const modelId of tierModels) {
            const entry = modelMap.get(modelId);
            if (!entry)
                continue;
            const hasCreds = yield* auth.hasCredentials(entry.provider);
            if (hasCreds) {
                return modelId;
            }
        }
        // Fallback: return the first model in the tier even without creds check
        // (the user might have a generic MOMO_API_KEY)
        return tierModels[0];
    });
}
/**
 * Resolve a model identifier (ID, alias, or tier name) to a concrete model.
 * Handles:
 * - Tier names ("ultra", "standard", "lite")
 * - Direct model IDs
 * - Fuzzy matching against known models
 * - Provider:model format
 */
export function resolveModel(identifier) {
    return Effect.gen(function* () {
        // Check if it's a tier name
        if (identifier in BUILTIN_TIERS) {
            const resolved = yield* resolveTierModel(identifier);
            if (resolved) {
                const entry = modelMap.get(resolved);
                if (entry)
                    return entry;
            }
        }
        // Direct lookup
        const direct = modelMap.get(identifier);
        if (direct)
            return direct;
        // Provider:model format
        if (identifier.includes(":")) {
            const [providerName, modelId] = identifier.split(":", 2);
            const entry = Array.from(modelMap.values()).find((m) => m.provider === providerName &&
                (m.id === modelId || m.providerModelId === modelId));
            if (entry)
                return entry;
        }
        // Fuzzy match against model IDs and names
        const allModels = Array.from(modelMap.values());
        const results = fuzzysort.go(identifier, allModels, {
            keys: [(m) => m.id, (m) => m.name, (m) => m.provider],
            threshold: -10_000,
        });
        if (results.length > 0 && results[0].obj) {
            return results[0].obj;
        }
        return yield* new ModelResolutionError({
            message: `Could not resolve model "${identifier}". Available tiers: ultra, standard, lite. Run 'momo models list' to see all models.`,
            modelId: identifier,
        });
    });
}
/**
 * Expand a model identifier to its full provider:modelId form.
 */
export function expandModelId(identifier) {
    return Effect.gen(function* () {
        const entry = yield* resolveModel(identifier);
        return `${entry.provider}:${entry.providerModelId}`;
    });
}
// ---------------------------------------------------------------------------
// Provider service
// ---------------------------------------------------------------------------
/**
 * Provider service is the central registry and factory for LLM providers.
 *
 * It handles:
 * - Loading and caching provider configurations
 * - Resolving model identifiers (tiers, aliases, fuzzy matching)
 * - Creating AI SDK compatible model instances
 * - Managing Claude Code ecosystem inheritance
 * - Injecting momo brand headers into gateway providers
 */
export class Provider extends Effect.Service()("Provider", {
    effect: Effect.gen(function* () {
        const config = yield* Config;
        const env = yield* Env;
        const auth = yield* Auth;
        const instanceState = yield* InstanceState;
        const transform = yield* ProviderTransform;
        // -- Cached state --
        /** Cache of resolved provider configurations. */
        const providerConfigCache = yield* Ref.make(new Map());
        /** Cache of resolved credentials per provider. */
        const credentialCache = yield* Ref.make(new Map());
        // -- Internal helpers --
        /**
         * Get or create the cached provider configuration.
         */
        const getProviderConfig = (name) => Effect.gen(function* () {
            const cached = yield* Ref.get(providerConfigCache);
            if (cached.has(name)) {
                return cached.get(name);
            }
            const factory = PROVIDER_FACTORIES[name];
            if (!factory) {
                return yield* new ProviderInitializationError({
                    message: `Unknown provider "${name}". Available: ${listProviderNames().join(", ")}`,
                    providerName: name,
                });
            }
            const result = factory();
            yield* Ref.update(providerConfigCache, (map) => {
                map.set(name, result);
                return map;
            });
            return result;
        });
        /**
         * Get credentials for a provider (with caching).
         */
        const getCredentials = (providerName) => Effect.gen(function* () {
            const cached = yield* Ref.get(credentialCache);
            if (cached.has(providerName)) {
                return cached.get(providerName);
            }
            const creds = yield* auth.resolveCredentials(providerName);
            yield* Ref.update(credentialCache, (map) => {
                map.set(providerName, creds);
                return map;
            });
            return creds;
        });
        /**
         * Resolve the effective chunk timeout.
         * Uses MOMO_CHUNK_TIMEOUT env var, or provider-specific, or default.
         */
        const resolveChunkTimeout = (providerName) => Effect.gen(function* () {
            const envTimeout = yield* env.getNumber("MOMO_CHUNK_TIMEOUT");
            if (envTimeout)
                return envTimeout;
            const providerConfig = yield* getProviderConfig(providerName);
            return providerConfig.timeout || DEFAULT_CHUNK_TIMEOUT;
        });
        /**
         * Load Claude Code settings and merge with momo config.
         */
        const loadMergedConfig = Effect.gen(function* () {
            const claudeSettings = yield* loadClaudeCodeSettings();
            const userConfig = yield* config.getRaw;
            if (!claudeSettings) {
                return userConfig;
            }
            // Merge Claude settings into momo config (momo config takes priority)
            const merged = {
                ...claudeSettings,
                ...userConfig,
                // Deep-merge provider configs if both have them
                providers: {
                    ...claudeSettings.providers,
                    ...userConfig.providers,
                },
            };
            return merged;
        });
        /**
         * Create a unified language model for the given provider and model.
         */
        const createModel = (providerName, modelId) => Effect.gen(function* () {
            const providerConfig = yield* getProviderConfig(providerName);
            const creds = yield* getCredentials(providerName);
            if (!creds) {
                return yield* new ProviderError({
                    message: `No credentials available for provider "${providerName}". Set MOMO_API_KEY or the provider-specific API key environment variable.`,
                });
            }
            // Resolve model entry
            const entry = modelMap.get(modelId);
            const providerModelId = entry?.providerModelId ||
                modelId;
            // Resolve chunk timeout
            const chunkTimeout = yield* resolveChunkTimeout(providerName);
            // Build headers
            const headers = {
                ...providerConfig.headers,
                ...creds.headers,
                Authorization: `Bearer ${creds.apiKey}`,
            };
            // Override base URL if credentials specify one
            const baseUrl = creds.baseUrl || providerConfig.baseUrl;
            // Create the AI SDK compatible model
            // We use a thin adapter that conforms to LanguageModelV3
            const model = {
                specificationVersion: "v3",
                provider: `momo.${providerName}`,
                modelId: providerModelId,
                supportedUrls: {},
                doGenerate: (_options) => {
                    return Promise.reject(new ProviderError({
                        message: "doGenerate not implemented - use doStream",
                    }));
                },
                doStream: (_options) => {
                    return Promise.reject(new ProviderError({
                        message: "doStream not implemented - use streaming adapter",
                    }));
                },
            };
            // Update instance state
            yield* instanceState.setModel(model, modelId, providerName);
            return {
                model,
                provider: providerName,
                modelId: providerModelId,
                entry: entry ||
                    {
                        id: modelId,
                        providerModelId: modelId,
                        provider: providerName,
                        name: modelId,
                        status: ModelStatus.Available,
                        contextWindow: 128_000,
                        capabilities: ["coding"],
                        supportsTools: true,
                        supportsVision: false,
                        costTier: "medium",
                    },
                chunkTimeout,
            };
        });
        /**
         * Resolve a model identifier and create the model instance.
         * This is the main entry point for model creation.
         */
        const resolveAndCreate = (identifier) => Effect.gen(function* () {
            // Use identifier from args, env, config, or default tier
            const resolvedIdentifier = identifier ||
                (yield* env.getString("MOMO_MODEL")) ||
                (yield* config.getOptional("model")) ||
                "standard";
            // Check if it's a tier
            const tierName = BUILTIN_TIERS[resolvedIdentifier]
                ? resolvedIdentifier
                : null;
            if (tierName) {
                const modelId = yield* resolveTierModel(tierName);
                if (modelId) {
                    const entry = modelMap.get(modelId);
                    if (entry) {
                        return yield* createModel(entry.provider, modelId);
                    }
                }
            }
            // Try direct resolution
            const resolved = yield* Effect.either(resolveModel(resolvedIdentifier));
            if (resolved._tag === "Right") {
                return yield* createModel(resolved.right.provider, resolved.right.id);
            }
            // Fallback: try to use identifier directly with a provider
            const defaultProvider = (yield* env.getString("MOMO_PROVIDER")) ||
                (yield* config.getOptional("provider")) ||
                "llmgateway";
            return yield* createModel(defaultProvider, resolvedIdentifier);
        });
        /**
         * Get the current model from instance state.
         */
        const getCurrentModel = Effect.gen(function* () {
            const state = yield* instanceState.get;
            if (!state.currentModel) {
                return yield* new ProviderError({
                    message: "No model is currently selected. Call resolveAndCreate() first.",
                });
            }
            return {
                model: state.currentModel,
                provider: state.currentProvider,
                modelId: state.resolvedModelId,
                entry: modelMap.get(state.resolvedModelId) ||
                    {
                        id: state.resolvedModelId,
                        providerModelId: state.resolvedModelId,
                        provider: state.currentProvider,
                        name: state.resolvedModelId,
                        status: ModelStatus.Available,
                        contextWindow: 128_000,
                        capabilities: ["coding"],
                        supportsTools: true,
                        supportsVision: false,
                        costTier: "medium",
                    },
                chunkTimeout: DEFAULT_CHUNK_TIMEOUT,
            };
        });
        /**
         * Switch to a different model mid-session.
         */
        const switchModel = (identifier) => Effect.gen(function* () {
            const newModel = yield* resolveAndCreate(identifier);
            yield* instanceState.setModel(newModel.model, newModel.modelId, newModel.provider, identifier in BUILTIN_TIERS);
            return newModel;
        });
        /**
         * Check if Claude Code inheritance is active.
         */
        const getClaudeCodeInheritance = Effect.sync(() => resolveClaudeCodeInheritance());
        /**
         * List all models available to the user (built-in + remote if available).
         */
        const listAllModels = Effect.gen(function* () {
            const models = Array.from(new Map(BUILTIN_MODELS.map((m) => [m.id, m])).values());
            // Check credentials for each
            const withAvailability = yield* Effect.forEach(models, (model) => Effect.gen(function* () {
                const hasCreds = yield* auth.hasCredentials(model.provider);
                return {
                    ...model,
                    available: hasCreds,
                };
            }));
            return withAvailability;
        });
        /**
         * Get model info for display.
         */
        const getModelInfo = (modelId) => Effect.sync(() => modelMap.get(modelId) || null);
        return {
            // Provider management
            getProviderConfig,
            getCredentials,
            listProviderNames,
            listAvailableProviders,
            // Model resolution
            resolveModel,
            resolveTierModel,
            expandModelId,
            createModel,
            resolveAndCreate,
            getCurrentModel,
            switchModel,
            getModelInfo,
            listAllModels,
            // Configuration
            loadMergedConfig,
            resolveChunkTimeout,
            // Claude Code ecosystem
            getClaudeCodeInheritance,
            // Utilities
            wrapSSE,
        };
    }),
    dependencies: [Config.Default, Env.Default, Auth.Default, InstanceState.Default, ProviderTransform.Default],
}) {
}
/** Default live layer for the Provider service. */
export const ProviderLive = Provider.Default;
// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------
export { ModelStatus } from "./model-status.js";
export { ProviderTransform } from "./transform.js";
export { ProviderError, ChunkTimeoutError, ModelResolutionError, ProviderInitializationError, } from "./error.js";
//# sourceMappingURL=provider.js.map