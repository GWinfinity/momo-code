/**
 * Schema utilities for momo Code.
 * Provides helpers for working with Effect Schema.
 */
import { Schema } from "effect";
/**
 * Make all properties of an object schema optional, omitting undefined values.
 */
export function optionalOmitUndefined(schema) {
    return schema;
}
/**
 * Schema for user configuration validation.
 */
export const UserConfigSchema = Schema.Struct({
    model: Schema.optional(Schema.String),
    provider: Schema.optional(Schema.String),
    apiKey: Schema.optional(Schema.String),
    baseUrl: Schema.optional(Schema.String),
    tier: Schema.optional(Schema.Literal("ultra", "standard", "lite")),
    theme: Schema.optional(Schema.Literal("dark", "light", "system")),
    analytics: Schema.optional(Schema.Boolean),
    inheritClaudeCode: Schema.optional(Schema.Boolean),
    inheritClaudePrompts: Schema.optional(Schema.Boolean),
    inheritClaudeSettings: Schema.optional(Schema.Boolean),
});
//# sourceMappingURL=schema.js.map