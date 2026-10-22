// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Chain-of-Thought Panel
// Displays agent thinking steps in momo style

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"

let cotBuffer: string[] = []
let isExpanded = process.env.MOMO_UI_COT === "expanded"

export const cotExtension: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", async (_event, ctx) => {
    cotBuffer = []
    if (ctx.mode === "tui") {
      ctx.ui.setStatus("momo-cot", undefined)
      if (!isExpanded) {
        ctx.ui.notify("🧠 Thinking... (⌃T to expand)", "info")
      }
      return
    }
    if (process.stderr.isTTY && !isExpanded) {
      console.error("🧠 Thinking... (⌃T to expand)")
    }
  })

  // Pi doesn't have a direct "thinking" hook, so we intercept tool planning
  pi.on("tool_call", async (event, ctx) => {
    const file = "path" in event.input ? event.input.path : undefined
    const step = `→ ${event.toolName}${file ? ` (${file})` : ""}`
    cotBuffer.push(step)

    if (!isExpanded) return
    if (ctx.mode === "tui") {
      ctx.ui.setStatus("momo-cot", step)
    } else if (process.stderr.isTTY) {
      console.error(`  ${step}`)
    }
  })

  pi.on("agent_settled", async (_event, ctx) => {
    if (isExpanded || cotBuffer.length === 0) return
    if (ctx.mode === "tui") {
      ctx.ui.setStatus("momo-cot", `🧠 ${cotBuffer.length} steps`)
    } else if (process.stderr.isTTY) {
      console.error(`\n  (${cotBuffer.length} steps)`)
    }
  })
}

/**
 * Toggle CoT display mode
 * Call from keyboard handler (⌃T)
 */
export function toggleCoT(): void {
  isExpanded = !isExpanded
  console.error(isExpanded ? "\n[CoT expanded]" : "\n[CoT collapsed]")
}
