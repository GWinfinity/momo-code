/**
 * Schema utilities for momo Code.
 * Provides helpers for working with Effect Schema.
 */
import { Schema } from "effect";
/**
 * Make all properties of an object schema optional, omitting undefined values.
 */
export declare function optionalOmitUndefined<T extends Record<string, unknown>>(schema: Schema.Schema<T>): Schema.Schema<Partial<T>>;
/**
 * Schema for user configuration validation.
 */
export declare const UserConfigSchema: Schema.Struct<{
    model: Schema.optional<typeof Schema.String>;
    provider: Schema.optional<typeof Schema.String>;
    apiKey: Schema.optional<typeof Schema.String>;
    baseUrl: Schema.optional<typeof Schema.String>;
    tier: Schema.optional<Schema.Literal<["ultra", "standard", "lite"]>>;
    theme: Schema.optional<Schema.Literal<["dark", "light", "system"]>>;
    analytics: Schema.optional<typeof Schema.Boolean>;
    inheritClaudeCode: Schema.optional<typeof Schema.Boolean>;
    inheritClaudePrompts: Schema.optional<typeof Schema.Boolean>;
    inheritClaudeSettings: Schema.optional<typeof Schema.Boolean>;
}>;
//# sourceMappingURL=schema.d.ts.map