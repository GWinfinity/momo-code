/**
 * Authentication system for momo Code.
 * Manages API keys and credentials for various LLM providers.
 */
import { Effect } from "effect";
import { Env } from "./env.js";
import { Config } from "./config/config.js";
/**
 * Auth service manages provider authentication.
 */
export class Auth extends Effect.Service()("Auth", {
    effect: Effect.gen(function* () {
        const env = yield* Env;
        const config = yield* Config;
        /**
         * Resolve credentials for a named provider.
         * Checks env vars first, then falls back to config file.
         */
        const resolveCredentials = (providerName) => Effect.gen(function* () {
            const providerConfig = yield* config.getProviderConfig(providerName);
            // Map provider names to their env var key suffixes
            const envKeyMap = {
                anthropic: "MOMO_ANTHROPIC_API_KEY",
                openai: "MOMO_OPENAI_API_KEY",
                openrouter: "MOMO_OPENROUTER_API_KEY",
                google: "MOMO_GOOGLE_API_KEY",
                groq: "MOMO_GROQ_API_KEY",
                mistral: "MOMO_MISTRAL_API_KEY",
                xai: "MOMO_XAI_API_KEY",
                cohere: "MOMO_COHERE_API_KEY",
                azure: "MOMO_AZURE_API_KEY",
                "amazon-bedrock": "MOMO_BEDROCK_ACCESS_KEY_ID",
                nvidia: "MOMO_NVIDIA_API_KEY",
                "together-ai": "MOMO_TOGETHER_AI_API_KEY",
                perplexity: "MOMO_PERPLEXITY_API_KEY",
                deepinfra: "MOMO_DEEPINFRA_API_KEY",
                cerebras: "MOMO_CEREBRAS_API_KEY",
                alibaba: "MOMO_ALIBABA_API_KEY",
                vercel: "MOMO_VERCEL_AI_API_KEY",
            };
            const envKey = envKeyMap[providerName];
            const apiKeyFromEnv = envKey
                ? yield* env.getString(envKey)
                : undefined;
            // Check MOMO_API_KEY as generic fallback
            const genericApiKey = yield* env.getString("MOMO_API_KEY");
            const apiKey = apiKeyFromEnv ||
                providerConfig?.apiKey ||
                genericApiKey ||
                null;
            if (!apiKey) {
                return null;
            }
            const baseUrl = providerConfig?.baseUrl ||
                (yield* env.getString("MOMO_BASE_URL")) ||
                undefined;
            return {
                apiKey,
                baseUrl,
                headers: providerConfig?.headers || {},
            };
        });
        /**
         * Check if credentials are available for a provider.
         */
        const hasCredentials = (providerName) => Effect.gen(function* () {
            const creds = yield* resolveCredentials(providerName);
            return creds !== null;
        });
        /**
         * Require credentials for a provider, failing if not found.
         */
        const requireCredentials = (providerName) => Effect.gen(function* () {
            const creds = yield* resolveCredentials(providerName);
            if (creds === null) {
                return yield* Effect.fail(new Error(`No API key found for provider "${providerName}". ` +
                    `Set MOMO_API_KEY or the provider-specific environment variable.`));
            }
            return creds;
        });
        /**
         * Get the current user identity info (if available).
         */
        const getIdentity = Effect.gen(function* () {
            return {
                // Identity is inferred from API key usage patterns
                source: "api-key",
            };
        });
        return {
            resolveCredentials,
            hasCredentials,
            requireCredentials,
            getIdentity,
        };
    }),
    dependencies: [Env.Default, Config.Default],
}) {
}
/** Default live layer for the Auth service. */
export const AuthLive = Auth.Default;
//# sourceMappingURL=auth.js.map