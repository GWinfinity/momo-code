// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Decision Capsule Display
// Shows L0 decision confidence and evidence inline (shadow mode)

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"
import { getJEVEngine } from "../jev/runtime.js"
import type { DecisionQuestion } from "../jev/index.js"

interface DecisionChip {
  gate: string
  confidence: number
  latencyMs: number
  action: "pass" | "block" | "abstain"
  reason: string
}

const TOOL_GATE_QUESTION: DecisionQuestion = {
  id: "tool-gate",
  context:
    'Should this agent tool call be allowed to run without human review? Choose "block" only for destructive or out-of-scope operations.',
  options: [
    { label: "Allow: standard operation", value: "allow" },
    { label: "Confirm: needs user review", value: "confirm" },
    { label: "Block: dangerous operation", value: "block" },
  ],
}

function summarize(value: unknown, max: number): string {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? {})
  return s.length > max ? s.slice(0, max) + "…" : s
}

export const decisionsExtension: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", async () => {
    if (process.stdout.isTTY) {
      const engine = getJEVEngine()
      const gates = engine.getGates().join("/") || "none"
      console.error(
        `🧠 L0 Decision Backend: ${engine.getBackendName()} (${engine.getMode()}, gates: ${gates})`,
      )
    }
  })

  pi.on("tool_call", async (event) => {
    const engine = getJEVEngine()
    if (engine.getBackendName() === "noop") return

    const toolName =
      typeof (event as { toolName?: unknown }).toolName === "string"
        ? (event as { toolName: string }).toolName
        : "unknown"
    const input = (event as { input?: unknown }).input
    const context = `Tool gate\nTool: ${toolName}\nInput: ${summarize(input, 500)}`

    // The LLM decided to call the tool → its decision is "allow".
    // probe() records the backend answer for calibration without overriding anything.
    const answers = await engine.probe("tool", context, [TOOL_GATE_QUESTION], "allow")

    if (process.stdout.isTTY && process.env.MOMO_UI_DECISION_CHIPS === "true") {
      const ans = answers[0]
      if (!ans) return
      const chip: DecisionChip = {
        gate: "tool",
        confidence: ans.confidence,
        latencyMs: ans.latencyMs,
        action: ans.abstained ? "abstain" : ans.chosen === "block" ? "block" : "pass",
        reason: ans.abstained
          ? "JEV abstained → LLM decision (allow)"
          : `JEV: ${ans.chosen} → ${engine.getMode() === "shadow" ? "recorded only" : "applied"}`,
      }
      console.error("  " + renderDecisionChip(chip))
    }
  })
}

/**
 * Render decision capsule (used by P4 JEV layer)
 */
export function renderDecisionChip(chip: DecisionChip): string {
  const icon = chip.action === "pass" ? "✓" : chip.action === "block" ? "⊘" : "⚠"
  return `${icon} ${chip.gate} ${chip.confidence.toFixed(2)} → ${chip.reason} · ${chip.latencyMs}ms`
}
