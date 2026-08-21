/**
 * MOMO CODE — Interactive setup wizard.
 *
 * Guides first-time users through API key configuration
 * and writes settings to ~/.momo/momo.jsonc so they persist.
 */
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import { getConfigDir, getConfigFilePath } from "../../config/config.js"

const MAGENTA = "\x1b[95m"
const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"

interface ProviderInfo {
  name: string
  label: string
  envKey: string
  defaultBaseUrl: string
  defaultModel: string
  placeholder: string
}

const PROVIDERS: ProviderInfo[] = [
  {
    name: "deepseek",
    label: "DeepSeek",
    envKey: "MOMO_DEEPSEEK_API_KEY",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    placeholder: "sk-...",
  },
  {
    name: "openai",
    label: "OpenAI",
    envKey: "MOMO_OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    placeholder: "sk-...",
  },
  {
    name: "anthropic",
    label: "Anthropic (Claude)",
    envKey: "MOMO_ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    placeholder: "sk-ant-...",
  },
  {
    name: "minimax",
    label: "MiniMax",
    envKey: "MOMO_MINIMAX_API_KEY",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-Text-01",
    placeholder: "eyJ...",
  },
  {
    name: "moonshot",
    label: "Moonshot (Kimi)",
    envKey: "MOMO_MOONSHOT_API_KEY",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    placeholder: "sk-...",
  },
  {
    name: "zhipu",
    label: "Zhipu (GLM)",
    envKey: "MOMO_ZHIPU_API_KEY",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    placeholder: "...",
  },
  {
    name: "openrouter",
    label: "OpenRouter",
    envKey: "MOMO_OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
    placeholder: "sk-or-...",
  },
  {
    name: "custom",
    label: "Custom (OpenAI-compatible)",
    envKey: "MOMO_API_KEY",
    defaultBaseUrl: "",
    defaultModel: "",
    placeholder: "sk-...",
  },
]

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

/**
 * Run the interactive setup wizard.
 * Returns 0 on success, 1 on abort.
 */
export async function runSetupCommand(args: string[]): Promise<number> {
  const isQuiet = args.includes("--quiet") || args.includes("-q")
  const isNonInteractive = args.includes("--non-interactive")

  console.log()
  console.log(`${MAGENTA}${BOLD}  MOMO CODE${RESET} — Setup Wizard`)
  console.log(`${DIM}  Configure your AI provider to get started.${RESET}`)
  console.log()

  // Check if config already exists
  const configPath = getConfigFilePath()
  let existingConfig: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8")
      const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
      existingConfig = JSON.parse(stripped)
      console.log(`${YELLOW}  Found existing config at:${RESET} ${configPath}`)
      console.log(`${DIM}  Running setup will merge with existing settings.${RESET}`)
      console.log()
    } catch {
      // ignore parse errors
    }
  }

  // Check for existing env vars
  const envApiKey = process.env.MOMO_API_KEY
  const envProvider = process.env.MOMO_PROVIDER
  if (envApiKey) {
    console.log(
      `${GREEN}  Detected MOMO_API_KEY in environment.${RESET} Config file values will supplement, not override.`,
    )
    console.log()
  }

  if (isNonInteractive) {
    console.log(`${DIM}  --non-interactive: skipping prompts.${RESET}`)
    return 0
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    // Provider selection
    console.log(`${BOLD}  Select your AI provider:${RESET}`)
    PROVIDERS.forEach((p, i) => {
      const num = `${CYAN}${i + 1}${RESET}`
      console.log(`    ${num}. ${p.label}`)
    })
    console.log()

    const choice = await prompt(rl, `${BOLD}  Enter number [1-${PROVIDERS.length}]:${RESET} `)
    const idx = parseInt(choice, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= PROVIDERS.length) {
      console.log(`${YELLOW}  Invalid choice. Aborted.${RESET}`)
      return 1
    }

    const selected = PROVIDERS[idx]
    console.log(`\n  ${GREEN}Selected:${RESET} ${selected.label}`)
    console.log()

    // API Key
    const apiKey = await prompt(
      rl,
      `${BOLD}  Enter API key${DIM} (${selected.placeholder})${RESET}${BOLD}: ${RESET}`,
    )
    if (!apiKey) {
      console.log(`${YELLOW}  No API key entered. Aborted.${RESET}`)
      return 1
    }

    // Base URL (use default or ask for custom)
    let baseUrl = selected.defaultBaseUrl
    if (selected.name === "custom") {
      baseUrl = await prompt(rl, `${BOLD}  Enter base URL${DIM} (e.g. https://api.example.com/v1)${RESET}${BOLD}: ${RESET}`)
      if (!baseUrl) {
        console.log(`${YELLOW}  No base URL entered. Aborted.${RESET}`)
        return 1
      }
    } else {
      const useDefault = await prompt(
        rl,
        `${BOLD}  Base URL${DIM} [${selected.defaultBaseUrl}]${RESET}${BOLD}? ${DIM}(Enter to accept, or type custom)${RESET}: `,
      )
      if (useDefault) baseUrl = useDefault
    }

    // Model
    let model = selected.defaultModel
    if (selected.name === "custom") {
      model = await prompt(rl, `${BOLD}  Enter model name:${RESET} `)
      if (!model) {
        console.log(`${YELLOW}  No model specified. Aborted.${RESET}`)
        return 1
      }
    } else {
      const useDefault = await prompt(
        rl,
        `${BOLD}  Model${DIM} [${selected.defaultModel}]${RESET}${BOLD}? ${DIM}(Enter to accept, or type model name)${RESET}: `,
      )
      if (useDefault) model = useDefault
    }

    console.log()

    // Build config
    const newConfig: Record<string, unknown> = {
      ...existingConfig,
      provider: selected.name,
      model,
      providers: {
        ...(existingConfig.providers as Record<string, unknown> || {}),
        [selected.name]: {
          apiKey,
          baseUrl,
          defaultModel: model,
        },
      },
    }

    // Write config
    const configDir = getConfigDir()
    fs.mkdirSync(configDir, { recursive: true })

    const configContent = JSON.stringify(newConfig, null, 2)
    fs.writeFileSync(configPath, configContent, "utf-8")

    console.log(`${GREEN}  Configuration saved to:${RESET} ${configPath}`)
    console.log()
    console.log(`${BOLD}  Quick test:${RESET}`)
    console.log(`    ${CYAN}momo "hello"${RESET}`)
    console.log()
    console.log(`${DIM}  You can also set env vars to override (e.g. MOMO_API_KEY).${RESET}`)
    console.log(`${DIM}  Config file values are used as fallback when env vars are not set.${RESET}`)
    console.log()

    return 0
  } finally {
    rl.close()
  }
}
