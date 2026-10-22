// SPDX-License-Identifier: MIT
// Bind momo's extensions to Pi's cwd-aware session runtime and mode lifecycle.

import path from "path"
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  runPrintMode,
  SessionManager,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent"
import { getConfigDir } from "./config/config.js"
import { syncMomoConfigToPi } from "./pi-config-sync.js"
import {
  brandExtension,
  experienceExtension,
  memoryExtension,
  permissionsExtension,
  decisionsExtension,
  cotExtension,
  rsiExtension,
} from "./pi-extensions/index.js"

export async function createMomoRuntime() {
  // Bridge momo's provider config (CC Switch → momo.jsonc → MOMO_* env) into
  // Pi's auth.json / models.json / settings.json so the Pi engine starts
  // with working credentials instead of "No API key found for the model".
  await syncMomoConfigToPi(getConfigDir())

  const createRuntime: CreateAgentSessionRuntimeFactory = async (options) => {
    const services = await createAgentSessionServices({
      cwd: options.cwd,
      agentDir: options.agentDir,
      resourceLoaderOptions: {
        // Named inline extensions so the startup "[Extensions]" list shows
        // meaningful names instead of <inline:1>…<inline:7> fallbacks.
        extensionFactories: [
          { name: "momo-brand", factory: brandExtension },
          { name: "momo-experience", factory: experienceExtension },
          { name: "momo-memory", factory: memoryExtension },
          { name: "momo-permissions", factory: permissionsExtension },
          { name: "momo-decisions", factory: decisionsExtension },
          { name: "momo-cot", factory: cotExtension },
          { name: "momo-rsi", factory: rsiExtension },
        ],
      },
    })
    const errors = services.resourceLoader.getExtensions().errors
    if (errors.length > 0) throw new Error(errors.map((entry) => entry.error).join("\n"))
    const created = await createAgentSessionFromServices({
      services,
      sessionManager: options.sessionManager,
      sessionStartEvent: options.sessionStartEvent,
    })
    return { ...created, services, diagnostics: services.diagnostics }
  }
  const cwd = process.cwd()
  const agentDir = getConfigDir()
  return createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager: SessionManager.create(cwd, path.join(agentDir, "sessions")),
  })
}

export async function runMomoPrint(runtime: AgentSessionRuntime, mode: "text" | "json", prompt?: string) {
  const code = await runPrintMode(runtime, { mode, initialMessage: prompt })
  // Pi 1.1.0 only checks assistant failures in text mode. Read the final
  // session too: extensions may replace it, or a retry may recover an error.
  const lastAssistant = runtime.session.state.messages.slice().reverse()
    .find((message) => message.role === "assistant")
  return lastAssistant?.stopReason === "error" || lastAssistant?.stopReason === "aborted" ? 1 : code
}
