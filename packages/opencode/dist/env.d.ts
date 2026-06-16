/**
 * Environment variable definitions and accessors for momo Code.
 * All variables use the MOMO_ prefix to avoid collisions with other tools.
 */
import { Effect } from "effect";
import { Layer } from "effect";
/** Prefix used for all momo Code environment variables. */
export declare const ENV_PREFIX = "MOMO_";
/**
 * Well-known environment variable names used by momo Code.
 */
export declare const ENV_NAMES: {
    /** API key for the primary LLM provider. */
    readonly API_KEY: "MOMO_API_KEY";
    /** Base URL override for the LLM provider. */
    readonly BASE_URL: "MOMO_BASE_URL";
    /** Model ID or tier name to use. */
    readonly MODEL: "MOMO_MODEL";
    /** Provider name to use (e.g., 'anthropic', 'openai', 'openrouter'). */
    readonly PROVIDER: "MOMO_PROVIDER";
    /** URL for the model catalog API. */
    readonly MODELS_URL: "MOMO_MODELS_URL";
    /** Debug logging level. */
    readonly DEBUG: "MOMO_DEBUG";
    /** Disable analytics and telemetry. */
    readonly NO_ANALYTICS: "MOMO_NO_ANALYTICS";
    /** Configuration directory override. */
    readonly CONFIG_DIR: "MOMO_CONFIG_DIR";
    /** Claude Code ecosystem inheritance switch. */
    readonly CLAUDE_CODE_INHERIT: "MOMO_CLAUDE_CODE_INHERIT";
    /** Disable Claude Code prompts inheritance. */
    readonly NO_CLAUDE_PROMPTS: "MOMO_NO_CLAUDE_PROMPTS";
    /** Disable Claude Code settings inheritance. */
    readonly NO_CLAUDE_SETTINGS: "MOMO_NO_CLAUDE_SETTINGS";
    /** OpenRouter API key. */
    readonly OPENROUTER_API_KEY: "MOMO_OPENROUTER_API_KEY";
    /** Anthropic API key. */
    readonly ANTHROPIC_API_KEY: "MOMO_ANTHROPIC_API_KEY";
    /** OpenAI API key. */
    readonly OPENAI_API_KEY: "MOMO_OPENAI_API_KEY";
    /** Google API key. */
    readonly GOOGLE_API_KEY: "MOMO_GOOGLE_API_KEY";
    /** Groq API key. */
    readonly GROQ_API_KEY: "MOMO_GROQ_API_KEY";
    /** Mistral API key. */
    readonly MISTRAL_API_KEY: "MOMO_MISTRAL_API_KEY";
    /** XAI (Grok) API key. */
    readonly XAI_API_KEY: "MOMO_XAI_API_KEY";
    /** Cohere API key. */
    readonly COHERE_API_KEY: "MOMO_COHERE_API_KEY";
    /** Azure OpenAI API key. */
    readonly AZURE_API_KEY: "MOMO_AZURE_API_KEY";
    /** Azure OpenAI resource name. */
    readonly AZURE_RESOURCE_NAME: "MOMO_AZURE_RESOURCE_NAME";
    /** Bedrock access key ID. */
    readonly BEDROCK_ACCESS_KEY_ID: "MOMO_BEDROCK_ACCESS_KEY_ID";
    /** Bedrock secret access key. */
    readonly BEDROCK_SECRET_ACCESS_KEY: "MOMO_BEDROCK_SECRET_ACCESS_KEY";
    /** Bedrock region. */
    readonly BEDROCK_REGION: "MOMO_BEDROCK_REGION";
    /** NVIDIA API key. */
    readonly NVIDIA_API_KEY: "MOMO_NVIDIA_API_KEY";
    /** Together AI API key. */
    readonly TOGETHER_AI_API_KEY: "MOMO_TOGETHER_AI_API_KEY";
    /** Perplexity API key. */
    readonly PERPLEXITY_API_KEY: "MOMO_PERPLEXITY_API_KEY";
    /** DeepInfra API key. */
    readonly DEEPINFRA_API_KEY: "MOMO_DEEPINFRA_API_KEY";
    /** Cerebras API key. */
    readonly CEREBRAS_API_KEY: "MOMO_CEREBRAS_API_KEY";
    /** Alibaba Cloud API key. */
    readonly ALIBABA_API_KEY: "MOMO_ALIBABA_API_KEY";
    /** Vercel AI API key. */
    readonly VERCEL_AI_API_KEY: "MOMO_VERCEL_AI_API_KEY";
    /** Chunk timeout for streaming responses (ms). */
    readonly CHUNK_TIMEOUT: "MOMO_CHUNK_TIMEOUT";
    /** Default tier when none is specified. */
    readonly DEFAULT_TIER: "MOMO_DEFAULT_TIER";
    /** Force dark mode. */
    readonly DARK_MODE: "MOMO_DARK_MODE";
    /** Session ID for resuming conversations. */
    readonly SESSION_ID: "MOMO_SESSION_ID";
};
declare const Env_base: Effect.Service.Class<Env, "Env", {
    readonly effect: Effect.Effect<{
        getString: (name: string) => Effect.Effect<string | undefined>;
        getNumber: (name: string) => Effect.Effect<number | undefined>;
        getBoolean: (name: string) => Effect.Effect<boolean>;
        requireString: (name: string) => Effect.Effect<string, Error>;
    }, never, never>;
}>;
/**
 * Typed environment variable accessors.
 */
export declare class Env extends Env_base {
}
/** Live layer for the Env service. */
export declare const EnvLive: Layer.Layer<Env, never, never>;
export {};
//# sourceMappingURL=env.d.ts.map