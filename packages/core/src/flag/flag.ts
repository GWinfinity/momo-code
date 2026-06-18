import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["MOMO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["MOMO_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("MOMO_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  MOMO_HOME: process.env["MOMO_HOME"] || process.env["HOME"] + "/.momo",
  MOMO_CONFIG: process.env["MOMO_CONFIG"],
  MOMO_CONFIG_CONTENT: process.env["MOMO_CONFIG_CONTENT"],
  MOMO_AUTH_CONTENT: process.env["MOMO_AUTH_CONTENT"],
  MOMO_PERMISSION: process.env["MOMO_PERMISSION"],
  MOMO_AUTO_HEAP_SNAPSHOT: truthy("MOMO_AUTO_HEAP_SNAPSHOT"),
  MOMO_GIT_BASH_PATH: process.env["MOMO_GIT_BASH_PATH"],
  MOMO_DISABLE_AUTOUPDATE: truthy("MOMO_DISABLE_AUTOUPDATE"),
  MOMO_ALWAYS_NOTIFY_UPDATE: truthy("MOMO_ALWAYS_NOTIFY_UPDATE"),
  MOMO_DISABLE_PRUNE: truthy("MOMO_DISABLE_PRUNE"),
  MOMO_DISABLE_TERMINAL_TITLE: truthy("MOMO_DISABLE_TERMINAL_TITLE"),
  MOMO_SHOW_TTFD: truthy("MOMO_SHOW_TTFD"),
  MOMO_DISABLE_AUTOCOMPACT: truthy("MOMO_DISABLE_AUTOCOMPACT"),
  MOMO_DISABLE_MODELS_FETCH: truthy("MOMO_DISABLE_MODELS_FETCH"),
  MOMO_DISABLE_MOUSE: truthy("MOMO_DISABLE_MOUSE"),
  MOMO_FAKE_VCS: process.env["MOMO_FAKE_VCS"],
  MOMO_SERVER_PASSWORD: process.env["MOMO_SERVER_PASSWORD"],
  MOMO_SERVER_USERNAME: process.env["MOMO_SERVER_USERNAME"],
  MOMO_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("MOMO_DISABLE_FFF"),

  // Experimental
  MOMO_EXPERIMENTAL_FILEWATCHER: Config.boolean("MOMO_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  MOMO_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("MOMO_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  MOMO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("MOMO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  MOMO_MODELS_URL: process.env["MOMO_MODELS_URL"],
  MOMO_MODELS_PATH: process.env["MOMO_MODELS_PATH"],
  MOMO_DB: process.env["MOMO_DB"],

  MOMO_WORKSPACE_ID: process.env["MOMO_WORKSPACE_ID"],
  MOMO_EXPERIMENTAL_WORKSPACES: enabledByExperimental("MOMO_EXPERIMENTAL_WORKSPACES"),

  // Evolve flags -- control the autonomous evolution engine
  MOMO_EVOLVE_ENABLED: truthy("MOMO_EVOLVE_ENABLED"),
  MOMO_EVOLVE_AUTO: truthy("MOMO_EVOLVE_AUTO"),
  MOMO_EVOLVE_CLUSTER_THRESHOLD: process.env["MOMO_EVOLVE_CLUSTER_THRESHOLD"],
  MOMO_EVOLVE_DRIVER: process.env["MOMO_EVOLVE_DRIVER"],
  MOMO_EVOLVE_BUDGET_USD: process.env["MOMO_EVOLVE_BUDGET_USD"],
  MOMO_EVOLVE_DISABLE_TELEMETRY: truthy("MOMO_EVOLVE_DISABLE_TELEMETRY"),

  // Claude Code interoperability switches
  MOMO_DISABLE_CLAUDE_CODE: truthy("MOMO_DISABLE_CLAUDE_CODE"),
  MOMO_DISABLE_CLAUDE_CODE_PROMPT: truthy("MOMO_DISABLE_CLAUDE_CODE_PROMPT"),
  MOMO_DISABLE_CLAUDE_CODE_MCP: truthy("MOMO_DISABLE_CLAUDE_CODE_MCP"),
  MOMO_DISABLE_CLAUDE_CODE_COMMANDS: truthy("MOMO_DISABLE_CLAUDE_CODE_COMMANDS"),
  MOMO_DISABLE_CLAUDE_CODE_SKILLS: truthy("MOMO_DISABLE_CLAUDE_CODE_SKILLS"),
  MOMO_DISABLE_CODEX_SKILLS: truthy("MOMO_DISABLE_CODEX_SKILLS"),
  MOMO_DISABLE_OPENCODE_SKILLS: truthy("MOMO_DISABLE_OPENCODE_SKILLS"),
  MOMO_DISABLE_EXTERNAL_SKILLS: truthy("MOMO_DISABLE_EXTERNAL_SKILLS"),

  // Pure mode -- disable all external inheritance
  MOMO_ONLY: truthy("MOMO_ONLY"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get MOMO_DISABLE_PROJECT_CONFIG() {
    return truthy("MOMO_DISABLE_PROJECT_CONFIG")
  },
  get MOMO_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("MOMO_EXPERIMENTAL_REFERENCES")
  },
  get MOMO_TUI_CONFIG() {
    return process.env["MOMO_TUI_CONFIG"]
  },
  get MOMO_CONFIG_DIR() {
    return process.env["MOMO_CONFIG_DIR"]
  },
  get MOMO_PURE() {
    return truthy("MOMO_PURE")
  },
  get MOMO_PLUGIN_META_FILE() {
    return process.env["MOMO_PLUGIN_META_FILE"]
  },
  get MOMO_CLIENT() {
    return process.env["MOMO_CLIENT"] ?? "cli"
  },
}
