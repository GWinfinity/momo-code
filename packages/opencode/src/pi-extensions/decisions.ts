// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Decision Capsule Display
// Shows L0 decision confidence and evidence inline

import type { Extension } from "@earendil-works/pi-coding-agent"

interface DecisionChip {
  gate: string
  confidence: number
  latencyMs: number
  action: "pass" | "block" | "abstain"
  reason: string
}

export const decisionsExtension: Extension = {
  name: "momo-decisions",

  hooks: {
    before_agent_start: async () => {
      // Placeholder: in P4, this reads from JEV backend
      // For now, show a neutral indicator
      if (process.stdout.isTTY) {
        console.error("🧠 L0 Decision Backend: shadow mode (P4)")
      }
    },

    before_tool_execute: async (context) => {
      // P4: Show decision chips for tool gate
      const chip: DecisionChip = {
        gate: "tool",
        confidence: 0.75,
        latencyMs: 12,
        action: "pass",
        reason: "Standard file operation",
      }

      if (process.stdout.isTTY && process.env.MOMO_UI_DECISION_CHIPS === "true") {
        const icon = chip.action === "pass" ? "✓" : chip.action === "block" ? "⊘" : "⚠"
        console.error(`  ${icon} ${chip.gate} ${chip.confidence.toFixed(2)} · ${chip.latencyMs}ms`)
      }

      return { allowed: true }
    },
  },
}

/**
 * Render decision capsule (used by P4 JEV layer)
 */
export function renderDecisionChip(chip: DecisionChip): string {
  const icon = chip.action === "pass" ? "✓" : chip.action === "block" ? "⊘" : "⚠"
  return `${icon} ${chip.gate} ${chip.confidence.toFixed(2)} → ${chip.reason} · ${chip.latencyMs}ms`
}
