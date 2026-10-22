// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Decision Capsule Display
// Shows L0 decision confidence and evidence inline

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"

interface DecisionChip {
  gate: string
  confidence: number
  latencyMs: number
  action: "pass" | "block" | "abstain"
  reason: string
}

export const decisionsExtension: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", async (_event, ctx) => {
    // Placeholder: in P4, this reads from JEV backend
    // For now, show a neutral indicator
    const line = "🧠 L0 Decision Backend: shadow mode (P4)"
    if (ctx.mode === "tui") {
      ctx.ui.setStatus("momo-jev", line)
    } else if (process.stderr.isTTY) {
      console.error(line)
    }
  })

  pi.on("tool_call", async (_event, ctx) => {
    // P4: Show decision chips for tool gate
    const chip: DecisionChip = {
      gate: "tool",
      confidence: 0.75,
      latencyMs: 12,
      action: "pass",
      reason: "Standard file operation",
    }
    if (process.env.MOMO_UI_DECISION_CHIPS !== "true") return
    const icon = chip.action === "pass" ? "✓" : chip.action === "block" ? "⊘" : "⚠"
    const line = `  ${icon} ${chip.gate} ${chip.confidence.toFixed(2)} · ${chip.latencyMs}ms`
    if (ctx.mode === "tui") {
      ctx.ui.notify(line.trim(), "info")
    } else if (process.stderr.isTTY) {
      console.error(line)
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
