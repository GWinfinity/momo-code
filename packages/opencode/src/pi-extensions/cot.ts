// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Chain-of-Thought Panel
// Displays agent thinking steps in momo style

import type { InlineExtension } from "@earendil-works/pi-coding-agent"

let cotBuffer: string[] = []
let isExpanded = process.env.MOMO_UI_COT === "expanded"

export const cotExtension: InlineExtension = {
  name: "momo-cot",

  factory: (pi) => {
    pi.on("before_agent_start", () => {
      cotBuffer = []
      if (process.stdout.isTTY && !isExpanded) {
        console.error("🧠 Thinking... (⌃T to expand)")
      }
    })

    // Pi doesn't have a direct "thinking" hook, so we intercept tool planning
    pi.on("tool_call", (event) => {
      const input = event.input as Record<string, unknown> | undefined
      const step = `  → ${event.toolName}${input?.path ? ` (${String(input.path)})` : ""}`
      cotBuffer.push(step)

      if (isExpanded && process.stdout.isTTY) {
        console.error(step)
      }
    })

    pi.on("agent_settled", () => {
      if (!isExpanded && cotBuffer.length > 0 && process.stdout.isTTY) {
        // Summary mode: show count only
        console.error(`\n  (${cotBuffer.length} steps)`)
      }
    })
  },
}

/**
 * Toggle CoT display mode
 * Call from keyboard handler (⌃T)
 */
export function toggleCoT(): void {
  isExpanded = !isExpanded
  console.error(isExpanded ? "\n[CoT expanded]" : "\n[CoT collapsed]")
}
