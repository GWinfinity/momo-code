// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Permission Gate

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  />\s*\/dev\/null/,
  /mkfs\./,
  /dd\s+if=/,
  /:\(\)\{\s*:\|:\s*\&\s*\};:\s*\)/,
]

export const permissionsExtension: ExtensionFactory = (pi) => {
  pi.on("tool_call", async (event, context) => {
    const input = event.input
    const command = "command" in input ? input.command : undefined
    const dangerous = event.toolName === "bash" && typeof command === "string" &&
      DANGEROUS_PATTERNS.some((pattern) => pattern.test(command))
    const writing = ["write", "edit", "apply_patch"].includes(event.toolName)
    if (!dangerous && !writing) return

    // Print/JSON mode cannot obtain interactive approval.
    if (!context.hasUI) return { block: true, reason: "Operation requires interactive approval" }

    const file = "path" in input ? input.path : "file" in input ? input.file : "unknown"
    const detail = dangerous ? String(command) : `${event.toolName}: ${file}`
    const allowed = await context.ui.confirm("momo: Allow operation?", detail)
    if (!allowed) return { block: true, reason: "User declined" }
  })
}
