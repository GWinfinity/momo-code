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
import { Effect, Layer } from "effect";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { Config } from "@/config/config";
import { Env } from "@/env";
import { Auth, type ProviderCredentials } from "@/auth";
import { ProviderTransform } from "./transform";
import { ModelStatus } from "./model-status";
import { InstanceState } from "@/effect/instance-state";
import { ProviderError, ModelResolutionError, ProviderInitializationError } from "./error";
/** Default timeout for OpenAI-compatible header reads (10s). */
export declare const OPENAI_HEADER_TIMEOUT_DEFAULT = 10000;
/**
 * Default chunk timeout for streaming responses (8 minutes).
 * This accommodates cold-start TTFT for momo-coder-pro and other large models.
 */
export declare const DEFAULT_CHUNK_TIMEOUT = 480000;
/**
 * Built-in model tiers map human-friendly names to model IDs.
 * Each tier lists models in priority order (first available wins).
 */
export declare const BUILTIN_TIERS: {
    readonly ultra: readonly ["claude-sonnet-4", "gpt-5", "gemini-2.5-pro", "momo-coder-ultra"];
    readonly standard: readonly ["claude-sonnet-4", "gpt-4.1", "gemini-2.5-flash", "momo-coder-pro"];
    readonly lite: readonly ["claude-haiku", "gpt-4.1-mini", "gemini-2.5-flash-lite", "momo-coder-lite"];
};
/** Export tier names for CLI display. */
export type TierName = keyof typeof BUILTIN_TIERS;
/**
 * Model group entry for mapping model IDs to providers and capabilities.
 */
export interface ModelGroupEntry {
    /** Model ID as exposed to users. */
    readonly id: string;
    /** Internal provider-specific model ID. */
    readonly providerModelId: string;
    /** Provider name. */
    readonly provider: string;
    /** Human-readable name. */
    readonly name: string;
    /** Model status. */
    readonly status: ModelStatus;
    /** Context window size in tokens. */
    readonly contextWindow: number;
    /** Supported capabilities. */
    readonly capabilities: readonly string[];
    /** Whether this model supports tool calling. */
    readonly supportsTools: boolean;
    /** Whether this model supports vision/multimodal input. */
    readonly supportsVision: boolean;
    /** Maximum output tokens. */
    readonly maxOutputTokens?: number;
    /** Cost tier hint. */
    readonly costTier: "low" | "medium" | "high";
}
/**
 * Built-in model catalog with known models.
 * These are merged with remote catalog data.
 */
export declare const BUILTIN_MODELS: readonly ModelGroupEntry[];
/**
 * Claude Code inheritance configuration.
 * Controls which parts of the .claude/ directory are inherited.
 */
export interface ClaudeCodeInheritanceConfig {
    /** Master switch for all inheritance. */
    readonly enabled: boolean;
    /** Inherit .claude/settings.json. */
    readonly settings: boolean;
    /** Inherit .claude/prompts/ directory. */
    readonly prompts: boolean;
}
/**
 * Resolve Claude Code inheritance config from environment and user config.
 */
export declare function resolveClaudeCodeInheritance(): ClaudeCodeInheritanceConfig;
/**
 * Attempt to load Claude Code settings from ~/.claude/settings.json.
 */
export declare function loadClaudeCodeSettings(): Effect.Effect<Record<string, unknown> | null, null>;
/**
 * Find the .claude/prompts directory if inheritance is enabled.
 */
export declare function findClaudePromptsDir(): Effect.Effect<string | null>;
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
export declare function wrapSSE(res: Response, ms: number, ctl: AbortController): Response;
/**
 * Provider-specific configuration returned by factory functions.
 */
export interface ProviderFactoryResult {
    /** Base URL for the provider API. */
    readonly baseUrl?: string;
    /** Extra headers to inject into every request. */
    readonly headers?: Record<string, string>;
    /** Default model ID for this provider. */
    readonly defaultModel?: string;
    /** Request timeout in milliseconds. */
    readonly timeout?: number;
    /** Whether to enable SSE streaming. */
    readonly streaming?: boolean;
}
/**
 * Factory function type for creating provider configurations.
 */
export type ProviderFactory = () => ProviderFactoryResult;
/**
 * Provider registry mapping provider names to their factory functions.
 */
export declare const PROVIDER_FACTORIES: Record<string, ProviderFactory>;
/**
 * List all available provider names.
 */
export declare function listProviderNames(): string[];
/**
 * List available providers with metadata.
 */
export declare function listAvailableProviders(): Array<{
    name: string;
    envSuffix: string;
    description?: string;
}>;
/**
 * Resolve a tier name to the first available model ID.
 * Checks each model in the tier list and returns the first one whose
 * provider has credentials configured.
 */
export declare function resolveTierModel(tierName: string): Effect.Effect<string | null, never, Auth>;
/**
 * Resolve a model identifier (ID, alias, or tier name) to a concrete model.
 * Handles:
 * - Tier names ("ultra", "standard", "lite")
 * - Direct model IDs
 * - Fuzzy matching against known models
 * - Provider:model format
 */
export declare function resolveModel(identifier: string): Effect.Effect<ModelGroupEntry, ModelResolutionError, Auth>;
/**
 * Expand a model identifier to its full provider:modelId form.
 */
export declare function expandModelId(identifier: string): Effect.Effect<string, ModelResolutionError, Auth>;
/**
 * Unified language model interface returned by the Provider service.
 */
export interface UnifiedLanguageModel {
    /** Underlying AI SDK model. */
    readonly model: LanguageModelV3;
    /** Provider name. */
    readonly provider: string;
    /** Resolved model ID. */
    readonly modelId: string;
    /** Model entry metadata. */
    readonly entry: ModelGroupEntry;
    /** Chunk timeout for this model's streaming. */
    readonly chunkTimeout: number;
}
declare const Provider_base: Effect.Service.Class<Provider, "Provider", {
    readonly effect: Effect.Effect<{
        getProviderConfig: (name: string) => Effect.Effect<ProviderFactoryResult, ProviderInitializationError>;
        getCredentials: (providerName: string) => Effect.Effect<ProviderCredentials | null>;
        listProviderNames: typeof listProviderNames;
        listAvailableProviders: typeof listAvailableProviders;
        resolveModel: typeof resolveModel;
        resolveTierModel: typeof resolveTierModel;
        expandModelId: typeof expandModelId;
        createModel: (providerName: string, modelId: string) => Effect.Effect<UnifiedLanguageModel, ProviderError | ProviderInitializationError>;
        resolveAndCreate: (identifier?: string) => Effect.Effect<UnifiedLanguageModel, ProviderError | ProviderInitializationError, Auth>;
        getCurrentModel: Effect.Effect<{
            model: LanguageModelV3;
            provider: string;
            modelId: string;
            entry: ModelGroupEntry;
            chunkTimeout: number;
        }, ProviderError, never>;
        switchModel: (identifier: string) => Effect.Effect<UnifiedLanguageModel, ProviderError | ProviderInitializationError, Auth>;
        getModelInfo: (modelId: string) => Effect.Effect<ModelGroupEntry | null>;
        listAllModels: Effect.Effect<{
            available: boolean;
            id: string;
            providerModelId: string;
            provider: string;
            name: string;
            status: ModelStatus;
            contextWindow: number;
            capabilities: readonly string[];
            supportsTools: boolean;
            supportsVision: boolean;
            maxOutputTokens?: number;
            costTier: "low" | "medium" | "high";
        }[], never, never>;
        loadMergedConfig: Effect.Effect<import("@/config/config").UserConfig, null, never>;
        resolveChunkTimeout: (providerName: string) => Effect.Effect<number, ProviderInitializationError>;
        getClaudeCodeInheritance: Effect.Effect<ClaudeCodeInheritanceConfig, never, never>;
        wrapSSE: typeof wrapSSE;
    }, never, Env | Config | Auth | ProviderTransform | InstanceState>;
    readonly dependencies: readonly [Layer.Layer<Config, Error, never>, Layer.Layer<Env, never, never>, Layer.Layer<Auth, Error, never>, Layer.Layer<InstanceState, never, never>, Layer.Layer<ProviderTransform, never, never>];
}>;
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
export declare class Provider extends Provider_base {
}
/** Default live layer for the Provider service. */
export declare const ProviderLive: Layer.Layer<Provider, Error, never>;
export { ModelStatus } from "./model-status";
export { ProviderTransform } from "./transform";
export { ProviderError, ChunkTimeoutError, ModelResolutionError, ProviderInitializationError, } from "./error";
//# sourceMappingURL=provider.d.ts.map