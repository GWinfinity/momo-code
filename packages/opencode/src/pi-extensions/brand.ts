// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Brand Banner
// Displays momo-branded startup banner instead of Pi default

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"

const BANNER = `
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     ███╗   ███╗ ██████╗ ███╗   ███╗ ██████╗      ██████╗ ███████╗██████╗ ███████╗
║     ████╗ ████║██╔═══██╗████╗ ████║██╔═══██╗    ██╔════╝ ██╔════╝██╔══██╗██╔════╝
║     ██╔████╔██║██║   ██║██╔████╔██║██║   ██║    ██║  ███╗█████╗  ██████╔╝█████╗
║     ██║╚██╔╝██║██║   ██║██║╚██╔╝██║██║   ██║    ██║   ██║██╔══╝  ██╔══██╗██╔══╝
║     ██║ ╚═╝ ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝    ╚██████╔╝███████╗██║  ██║███████╗
║     ╚═╝     ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝
║                                                                ║
║     v2.0  —  Experience-Driven Agentic Coding                  ║
║     Type /help for commands  |  Ctrl+C to exit                 ║
╚════════════════════════════════════════════════════════════════╝
`

export const brandExtension: ExtensionFactory = (pi) => {
  // session_start fires once per session — never on before_agent_start,
  // which re-fires every turn and would repaint the banner over the TUI frame.
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode === "tui") {
      // Render through the TUI header; writing the banner to stderr would
      // scribble over the interactive frame.
      ctx.ui.setHeader(() => ({
        render(_width: number): string[] {
          return BANNER.split("\n").filter((line) => line.trim().length > 0)
        },
        invalidate() {},
      }))
      return
    }
    if (process.stderr.isTTY) {
      console.error(BANNER)
    }
  })
}
