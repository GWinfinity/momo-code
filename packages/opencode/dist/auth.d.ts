/**
 * Authentication system for momo Code.
 * Manages API keys and credentials for various LLM providers.
 */
import { Effect, Layer } from "effect";
import { Env } from "./env";
import { Config } from "./config/config";
/**
 * Resolved credentials for a specific provider.
 */
export interface ProviderCredentials {
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly headers?: Record<string, string>;
}
declare const Auth_base: Effect.Service.Class<Auth, "Auth", {
    readonly effect: Effect.Effect<{
        resolveCredentials: (providerName: string) => Effect.Effect<ProviderCredentials | null>;
        hasCredentials: (providerName: string) => Effect.Effect<boolean>;
        requireCredentials: (providerName: string) => Effect.Effect<ProviderCredentials, Error>;
        getIdentity: Effect.Effect<{
            source: string;
        }, never, never>;
    }, never, Env | Config>;
    readonly dependencies: readonly [Layer.Layer<Env, never, never>, Layer.Layer<Config, Error, never>];
}>;
/**
 * Auth service manages provider authentication.
 */
export declare class Auth extends Auth_base {
}
/** Default live layer for the Auth service. */
export declare const AuthLive: Layer.Layer<Auth, Error, never>;
export {};
//# sourceMappingURL=auth.d.ts.map