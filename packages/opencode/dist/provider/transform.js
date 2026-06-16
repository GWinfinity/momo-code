/**
 * Provider request/response transformation utilities for momo Code.
 * Handles format conversions between different provider APIs and the internal model.
 */
import { Effect } from "effect";
/**
 * Transform functions for adapting between provider-specific formats
 * and the unified internal representation.
 */
export class ProviderTransform extends Effect.Service()("ProviderTransform", {
    effect: Effect.gen(function* () {
        /**
         * Transform an OpenAI-compatible request body to provider-specific format.
         * Handles differences in message format, tool calling, and streaming options.
         */
        const transformRequest = (body, targetProvider) => {
            switch (targetProvider) {
                case "anthropic": {
                    // Anthropic uses 'max_tokens' instead of 'max_completion_tokens'
                    const transformed = { ...body };
                    if (transformed.max_completion_tokens !== undefined) {
                        transformed.max_tokens = transformed.max_completion_tokens;
                        delete transformed.max_completion_tokens;
                    }
                    // Anthropic uses 'system' as a top-level string
                    if (Array.isArray(transformed.messages) &&
                        transformed.messages.length > 0) {
                        const systemMsg = transformed.messages.find((m) => m.role === "system");
                        if (systemMsg) {
                            transformed.system =
                                typeof systemMsg.content === "string"
                                    ? systemMsg.content
                                    : JSON.stringify(systemMsg.content);
                            transformed.messages = transformed.messages.filter((m) => m.role !== "system");
                        }
                    }
                    return transformed;
                }
                case "google":
                case "google-vertex": {
                    // Google uses 'generationConfig' wrapper
                    const transformed = { ...body };
                    if (transformed.temperature !== undefined || transformed.topP !== undefined || transformed.max_tokens !== undefined || transformed.max_completion_tokens !== undefined) {
                        transformed.generationConfig = {
                            ...(transformed.temperature !== undefined && {
                                temperature: transformed.temperature,
                            }),
                            ...(transformed.top_p !== undefined && {
                                topP: transformed.top_p,
                            }),
                            ...(transformed.top_p !== undefined && {
                                topP: transformed.top_p,
                            }),
                            ...(transformed.max_tokens !== undefined && {
                                maxOutputTokens: transformed.max_tokens,
                            }),
                            ...(transformed.max_completion_tokens !== undefined && {
                                maxOutputTokens: transformed.max_completion_tokens,
                            }),
                        };
                        delete transformed.temperature;
                        delete transformed.top_p;
                        delete transformed.max_tokens;
                        delete transformed.max_completion_tokens;
                    }
                    return transformed;
                }
                case "amazon-bedrock": {
                    // Bedrock uses inferenceConfig wrapper
                    const transformed = { ...body };
                    if (transformed.max_tokens !== undefined || transformed.max_completion_tokens !== undefined || transformed.temperature !== undefined) {
                        transformed.inferenceConfig = {
                            ...(transformed.max_tokens !== undefined && {
                                maxTokens: transformed.max_tokens,
                            }),
                            ...(transformed.max_completion_tokens !== undefined && {
                                maxTokens: transformed.max_completion_tokens,
                            }),
                            ...(transformed.temperature !== undefined && {
                                temperature: transformed.temperature,
                            }),
                        };
                        delete transformed.max_tokens;
                        delete transformed.max_completion_tokens;
                        delete transformed.temperature;
                    }
                    return transformed;
                }
                case "cohere": {
                    // Cohere uses 'message' instead of 'messages' array
                    const transformed = { ...body };
                    if (Array.isArray(transformed.messages)) {
                        const userMsgs = transformed.messages.filter((m) => m.role === "user");
                        const assistantMsgs = transformed.messages.filter((m) => m.role === "assistant");
                        if (userMsgs.length > 0) {
                            const lastUserMsg = userMsgs[userMsgs.length - 1];
                            transformed.message =
                                typeof lastUserMsg.content === "string"
                                    ? lastUserMsg.content
                                    : JSON.stringify(lastUserMsg.content);
                        }
                        if (assistantMsgs.length > 0) {
                            transformed.chat_history = assistantMsgs.map((m) => ({
                                role: m.role,
                                message: typeof m.content === "string"
                                    ? m.content
                                    : JSON.stringify(m.content),
                            }));
                        }
                        delete transformed.messages;
                    }
                    return transformed;
                }
                default:
                    return body;
            }
        };
        /**
         * Transform a provider-specific response to the unified format.
         */
        const transformResponse = (body, sourceProvider) => {
            switch (sourceProvider) {
                case "anthropic": {
                    // Anthropic returns 'content' array with text blocks
                    if (Array.isArray(body.content) &&
                        body.content.length > 0 &&
                        body.content[0].type === "text") {
                        return {
                            ...body,
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: "assistant",
                                        content: body.content[0].text,
                                    },
                                    finish_reason: body.stop_reason,
                                },
                            ],
                        };
                    }
                    return body;
                }
                default:
                    return body;
            }
        };
        /**
         * Transform a provider-specific stream chunk to unified SSE format.
         */
        const transformStreamChunk = (chunk, sourceProvider) => {
            switch (sourceProvider) {
                case "anthropic": {
                    // Anthropic streaming uses 'content_block_delta' events
                    if (chunk.type === "content_block_delta" && chunk.delta) {
                        const delta = chunk.delta;
                        if (delta.type === "text_delta" && delta.text) {
                            return {
                                choices: [
                                    {
                                        delta: { content: delta.text },
                                        index: 0,
                                    },
                                ],
                            };
                        }
                    }
                    return null;
                }
                case "google":
                case "google-vertex": {
                    // Google streaming wraps chunks in candidates
                    if (Array.isArray(chunk.candidates) &&
                        chunk.candidates.length > 0) {
                        const candidate = chunk.candidates[0];
                        if (candidate.content &&
                            Array.isArray(candidate.content.parts)) {
                            const parts = candidate.content.parts;
                            const text = parts
                                .filter((p) => typeof p.text === "string")
                                .map((p) => p.text)
                                .join("");
                            return {
                                choices: [
                                    {
                                        delta: { content: text },
                                        index: 0,
                                    },
                                ],
                            };
                        }
                    }
                    return null;
                }
                default:
                    return chunk;
            }
        };
        return {
            transformRequest,
            transformResponse,
            transformStreamChunk,
        };
    }),
}) {
}
//# sourceMappingURL=transform.js.map