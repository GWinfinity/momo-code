/**
 * MOMO CODE — Core agent chat loop.
 *
 * The minimal viable agent loop:
 *   prompt → resolve provider + model → fetch /chat/completions
 *   → parse SSE stream → print tokens
 *
 * Uses native fetch + SSE parsing. Works with any OpenAI-compatible endpoint.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatOptions {
  /** Provider base URL (e.g. https://api.minimaxi.com/v1) */
  baseUrl: string
  /** API key */
  apiKey: string
  /** Model ID */
  model: string
  /** System prompt */
  system?: string
  /** User messages */
  messages: ChatMessage[]
  /** Stream or non-streaming */
  stream?: boolean
  /** Temperature */
  temperature?: number
  /** Extra headers */
  headers?: Record<string, string>
  /** Request timeout in ms */
  timeout?: number
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const MAGENTA = "\x1b[95m"

// ---------------------------------------------------------------------------
// SSE stream parser
// ---------------------------------------------------------------------------

/**
 * Parse a Server-Sent Events stream into text chunks.
 * Handles the standard OpenAI stream format:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}
 *   data: [DONE]
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string, void> {
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete lines
    let lineEnd: number
    while ((lineEnd = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, lineEnd).trim()
      buffer = buffer.slice(lineEnd + 1)

      if (!line.startsWith("data: ")) continue
      const data = line.slice(6)

      if (data === "[DONE]") return

      try {
        const parsed = JSON.parse(data)
        // OpenAI format: choices[0].delta.content
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
        // Also handle 'reasoning_content' (some Chinese providers)
        const reasoning = parsed.choices?.[0]?.delta?.reasoning_content
        if (reasoning) yield reasoning
      } catch {
        // Skip unparseable lines
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Chat completion caller
// ---------------------------------------------------------------------------

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * Returns the full response text (non-streaming) or prints tokens (streaming).
 */
export async function chatComplete(opts: ChatOptions): Promise<string> {
  const {
    baseUrl,
    apiKey,
    model,
    system,
    messages,
    stream = true,
    temperature = 0.7,
    headers: extraHeaders = {},
    timeout = 120_000,
  } = opts

  // Build messages array
  const bodyMessages: ChatMessage[] = system
    ? [{ role: "system", content: system }, ...messages]
    : [...messages]

  const body = JSON.stringify({
    model,
    messages: bodyMessages,
    stream,
    temperature,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}${errorText ? ` | ${errorText.slice(0, 500)}` : ""}`,
      )
    }

    if (!stream) {
      // Non-streaming: parse full JSON response
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return data.choices?.[0]?.message?.content || ""
    }

    // Streaming: parse SSE and collect tokens
    if (!response.body) {
      throw new Error("No response body for streaming")
    }

    const reader = response.body.getReader()
    let fullText = ""

    for await (const chunk of parseSSEStream(reader)) {
      process.stdout.write(chunk)
      fullText += chunk
    }

    return fullText
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`)
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Provider configuration resolver
// ---------------------------------------------------------------------------

/**
 * Resolve provider config from environment variables.
 * Returns null if no credentials found.
 */
export function resolveProviderFromEnv(): {
  baseUrl: string
  apiKey: string
  model: string
  providerName: string
} | null {
  // Generic key + provider
  const genericKey = process.env.MOMO_API_KEY
  const provider = process.env.MOMO_PROVIDER || "openai"

  // Check provider-specific key
  const providerUpper = provider.toUpperCase().replace(/-/g, "_")
  const specificKey =
    process.env[`MOMO_${providerUpper}_API_KEY`] ||
    process.env[`MOMO_${provider.replace(/-/g, "_").toUpperCase()}_API_KEY`]

  const apiKey = specificKey || genericKey
  if (!apiKey) return null

  // Get base URL from factory or env
  const baseUrlFromEnv = process.env.MOMO_BASE_URL
  const modelFromEnv = process.env.MOMO_MODEL

  // Use factory to get defaults
  const factory = getFactoryConfig(provider)

  return {
    baseUrl: baseUrlFromEnv || factory.baseUrl || "",
    apiKey,
    model: modelFromEnv || factory.defaultModel || "gpt-4",
    providerName: provider,
  }
}

/** Get factory defaults for a provider name. */
function getFactoryConfig(name: string): {
  baseUrl?: string
  defaultModel?: string
} {
  // Inline minimal factories (avoid importing provider.ts at runtime)
  const factories: Record<string, { baseUrl: string; defaultModel: string }> = {
    openai: { baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1" },
    anthropic: {
      baseUrl: "https://api.anthropic.com/v1",
      defaultModel: "claude-sonnet-4-20250514",
    },
    google: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      defaultModel: "gemini-2.5-flash-preview-04-17",
    },
    openrouter: {
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "anthropic/claude-sonnet-4",
    },
    groq: {
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "llama-3.1-70b-versatile",
    },
    minimax: {
      baseUrl: "https://api.minimaxi.com/v1",
      defaultModel: "MiniMax-M2.7",
    },
    zhipu: {
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      defaultModel: "glm-4-plus",
    },
    moonshot: {
      baseUrl: "https://api.moonshot.cn/v1",
      defaultModel: "moonshot-v1-128k",
    },
    doubao: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      defaultModel: "doubao-pro-128k",
    },
    stepfun: {
      baseUrl: "https://api.stepfun.com/v1",
      defaultModel: "step-2-16k",
    },
    alibaba: {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModel: "qwen2.5-72b-instruct",
    },
    mistral: {
      baseUrl: "https://api.mistral.ai/v1",
      defaultModel: "mistral-large-latest",
    },
    xai: { baseUrl: "https://api.x.ai/v1", defaultModel: "grok-2" },
    custom: {
      baseUrl: process.env.MOMO_CUSTOM_BASE_URL || "",
      defaultModel: process.env.MOMO_CUSTOM_MODEL || "",
    },
  }

  return factories[name] || { baseUrl: "", defaultModel: "gpt-4" }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT = `You are MOMO CODE, an AI coding assistant. You help users write, refactor, debug, and understand code.

Guidelines:
- Provide concise, actionable responses
- Use code blocks with language tags for code
- Ask clarifying questions when requirements are ambiguous
- Prefer modern best practices
- Consider security implications`

// ---------------------------------------------------------------------------
// Main chat loop
// ---------------------------------------------------------------------------

/**
 * Run a single-turn chat session.
 *
 * @param prompt — The user's coding request
 * @returns Exit code (0 = success, 1 = error)
 */
export async function runChat(prompt: string): Promise<number> {
  // Resolve provider configuration
  const config = resolveProviderFromEnv()

  if (!config) {
    console.error(`${RESET}`)
    console.error(
      `${MAGENTA}MOMO CODE${RESET}: No API key configured.\n`,
    )
    console.error(`Set one of the following environment variables:`)
    console.error(`  ${CYAN}MOMO_API_KEY${RESET}          Generic key (works with any provider)`)
    console.error(`  ${CYAN}MOMO_<PROVIDER>_API_KEY${RESET}  Provider-specific key`)
    console.error(`\nExamples:`)
    console.error(`  export MOMO_API_KEY=sk-...`)
    console.error(`  export MOMO_MINIMAX_API_KEY=sk-...`)
    console.error(`  export MOMO_PROVIDER=minimax`)
    console.error(`\nSupported providers: openai, anthropic, google, openrouter,`)
    console.error(`  minimax, zhipu, moonshot, doubao, stepfun, alibaba, ...`)
    console.error(`\nDocs: https://momozi.cc`)
    return 1
  }

  if (!config.baseUrl) {
    console.error(
      `${MAGENTA}MOMO CODE${RESET}: Provider "${config.providerName}" has no base URL.`,
    )
    console.error(`Set ${CYAN}MOMO_BASE_URL${RESET} or check the provider name.`)
    return 1
  }

  // Print session header
  console.error(
    `${DIM}→ ${config.providerName} | ${config.model}${RESET}`,
  )
  console.error(``)

  try {
    // Call the model
    const response = await chatComplete({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      temperature: 0.7,
    })

    console.error(``) // newline after stream
    return 0
  } catch (err) {
    console.error(``)
    console.error(
      `${MAGENTA}MOMO CODE${RESET} ${RESET}Error: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    )

    // Helpful hints for common errors
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("401") || msg.includes("403")) {
      console.error(`\nHint: Check that your API key is valid and not expired.`)
    } else if (msg.includes("404")) {
      console.error(`\nHint: The model "${config.model}" may not be available.`)
      console.error(`      Try: export MOMO_MODEL=<different-model>`)
    } else if (msg.includes("timed out")) {
      console.error(`\nHint: The model is taking too long. Try again or use a faster model.`)
    }

    return 1
  }
}
