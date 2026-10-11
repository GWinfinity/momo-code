// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Permission Gate
// Adds momo-style confirmation for sensitive operations

import type { Extension } from "@earendil-works/pi-coding-agent"
import readline from "readline"

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  />\s*\/dev\/null/,
  /mkfs\./,
  /dd\s+if=/,
  /:\(\)\{\s*:\|:\s*\&\s*\};:\s*\)/, // fork bomb
]

function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(command))
}

async function askUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${question} [Y/n] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() !== "n")
    })
  })
}

export const permissionsExtension: Extension = {
  name: "momo-permissions",

  hooks: {
    before_tool_execute: async (context) => {
      const tool = context.tool
      const args = context.args || {}

      // Auto-allow safe tools
      const safeTools = ["read", "view", "grep", "glob", "ls"]
      if (safeTools.includes(tool)) {
        return { allowed: true }
      }

      // Dangerous command detection
      if (tool === "bash" && args.command && isDangerous(args.command)) {
        console.error(`\n⚠️  Dangerous command detected: ${args.command}`)
        const allowed = await askUser("Block this command?")
        if (!allowed) {
          return {
            allowed: false,
            reason: "User blocked dangerous command",
          }
        }
      }

      // Write/Edit tools — always confirm
      if (["write", "edit", "apply_patch"].includes(tool)) {
        const filePath = args.path || args.file || "unknown"
        console.error(`\n🔧 ${tool.toUpperCase()}: ${filePath}`)
        const allowed = await askUser("Allow?")
        if (!allowed) {
          return {
            allowed: false,
            reason: "User declined",
          }
        }
      }

      return { allowed: true }
    },
  },
}
