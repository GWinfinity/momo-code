/**
 * Environment variable definitions and accessors for momo Code.
 * All variables use the MOMO_ prefix to avoid collisions with other tools.
 */
import { Effect } from "effect";
/** Prefix used for all momo Code environment variables. */
export const ENV_PREFIX = "MOMO_";
/**
 * Well-known environment variable names used by momo Code.
 */
export const ENV_NAMES = {
    /** API key for the primary LLM provider. */
    API_KEY: "MOMO_API_KEY",
    /** Base URL override for the LLM provider. */
    BASE_URL: "MOMO_BASE_URL",
    /** Model ID or tier name to use. */
    MODEL: "MOMO_MODEL",
    /** Provider name to use (e.g., 'anthropic', 'openai', 'openrouter'). */
    PROVIDER: "MOMO_PROVIDER",
    /** URL for the model catalog API. */
    MODELS_URL: "MOMO_MODELS_URL",
    /** Debug logging level. */
    DEBUG: "MOMO_DEBUG",
    /** Disable analytics and telemetry. */
    NO_ANALYTICS: "MOMO_NO_ANALYTICS",
    /** Configuration directory override. */
    CONFIG_DIR: "MOMO_CONFIG_DIR",
    /** Claude Code ecosystem inheritance switch. */
    CLAUDE_CODE_INHERIT: "MOMO_CLAUDE_CODE_INHERIT",
    /** Disable Claude Code prompts inheritance. */
    NO_CLAUDE_PROMPTS: "MOMO_NO_CLAUDE_PROMPTS",
    /** Disable Claude Code settings inheritance. */
    NO_CLAUDE_SETTINGS: "MOMO_NO_CLAUDE_SETTINGS",
    /** OpenRouter API key. */
    OPENROUTER_API_KEY: "MOMO_OPENROUTER_API_KEY",
    /** Anthropic API key. */
    ANTHROPIC_API_KEY: "MOMO_ANTHROPIC_API_KEY",
    /** OpenAI API key. */
    OPENAI_API_KEY: "MOMO_OPENAI_API_KEY",
    /** Google API key. */
    GOOGLE_API_KEY: "MOMO_GOOGLE_API_KEY",
    /** Groq API key. */
    GROQ_API_KEY: "MOMO_GROQ_API_KEY",
    /** Mistral API key. */
    MISTRAL_API_KEY: "MOMO_MISTRAL_API_KEY",
    /** XAI (Grok) API key. */
    XAI_API_KEY: "MOMO_XAI_API_KEY",
    /** Cohere API key. */
    COHERE_API_KEY: "MOMO_COHERE_API_KEY",
    /** Azure OpenAI API key. */
    AZURE_API_KEY: "MOMO_AZURE_API_KEY",
    /** Azure OpenAI resource name. */
    AZURE_RESOURCE_NAME: "MOMO_AZURE_RESOURCE_NAME",
    /** Bedrock access key ID. */
    BEDROCK_ACCESS_KEY_ID: "MOMO_BEDROCK_ACCESS_KEY_ID",
    /** Bedrock secret access key. */
    BEDROCK_SECRET_ACCESS_KEY: "MOMO_BEDROCK_SECRET_ACCESS_KEY",
    /** Bedrock region. */
    BEDROCK_REGION: "MOMO_BEDROCK_REGION",
    /** NVIDIA API key. */
    NVIDIA_API_KEY: "MOMO_NVIDIA_API_KEY",
    /** Together AI API key. */
    TOGETHER_AI_API_KEY: "MOMO_TOGETHER_AI_API_KEY",
    /** Perplexity API key. */
    PERPLEXITY_API_KEY: "MOMO_PERPLEXITY_API_KEY",
    /** DeepInfra API key. */
    DEEPINFRA_API_KEY: "MOMO_DEEPINFRA_API_KEY",
    /** Cerebras API key. */
    CEREBRAS_API_KEY: "MOMO_CEREBRAS_API_KEY",
    /** Alibaba Cloud API key. */
    ALIBABA_API_KEY: "MOMO_ALIBABA_API_KEY",
    /** Vercel AI API key. */
    VERCEL_AI_API_KEY: "MOMO_VERCEL_AI_API_KEY",
    /** Chunk timeout for streaming responses (ms). */
    CHUNK_TIMEOUT: "MOMO_CHUNK_TIMEOUT",
    /** Default tier when none is specified. */
    DEFAULT_TIER: "MOMO_DEFAULT_TIER",
    /** Force dark mode. */
    DARK_MODE: "MOMO_DARK_MODE",
    /** Session ID for resuming conversations. */
    SESSION_ID: "MOMO_SESSION_ID",
};
/**
 * Typed environment variable accessors.
 */
export class Env extends Effect.Service()("Env", {
    effect: Effect.gen(function* () {
        const getString = (name) => Effect.sync(() => process.env[name]);
        const getNumber = (name) => Effect.sync(() => {
            const value = process.env[name];
            if (value === undefined)
                return undefined;
            const parsed = Number(value);
            return Number.isNaN(parsed) ? undefined : parsed;
        });
        const getBoolean = (name) => Effect.sync(() => {
            const value = process.env[name];
            return value === "1" || value === "true" || value === "yes";
        });
        const requireString = (name) => Effect.gen(function* () {
            const value = yield* getString(name);
            if (value === undefined) {
                return yield* Effect.fail(new Error(`Required environment variable ${name} is not set`));
            }
            return value;
        });
        return { getString, getNumber, getBoolean, requireString };
    }),
}) {
}
/** Live layer for the Env service. */
export const EnvLive = Env.Default;
//# sourceMappingURL=env.js.map