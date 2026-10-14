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
  pi.on("before_agent_start", async () => {
    // Only show banner in TTY mode
    if (process.stdout.isTTY) {
      console.error(BANNER)
    }
  })
}
