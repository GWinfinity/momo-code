/**
 * MOMO CODE — Web dashboard launcher.
 *
 *   momo web [--port=4097]
 *
 * Starts the local API server and opens the dashboard in the default browser.
 */
import { createServeApp } from "../../serve/server.js"

const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const MAGENTA = "\x1b[95m"
const BOLD = "\x1b[1m"

/**
 * Open a URL in the default browser (cross-platform).
 */
function openBrowser(url: string): void {
  const { exec } = require("child_process") as typeof import("child_process")
  const platform = process.platform

  let cmd: string
  if (platform === "win32") {
    cmd = `start "" "${url}"`
  } else if (platform === "darwin") {
    cmd = `open "${url}"`
  } else {
    cmd = `xdg-open "${url}"`
  }

  exec(cmd, (err: Error | null) => {
    if (err) {
      // Silently fail — user can open manually
    }
  })
}

export async function runWebCommand(args: string[]): Promise<void> {
  let port: number | undefined
  for (const a of args) {
    if (a.startsWith("--port=")) port = Number(a.slice(7)) || undefined
  }

  try {
    const app = await createServeApp({
      ...(port ? { port } : {}),
    })

    console.log()
    console.log(`${MAGENTA}${BOLD}  MOMO CODE${RESET} — Web Dashboard`)
    console.log()
    console.log(`  ${GREEN}Server:${RESET} ${app.url}`)
    console.log(`  ${GREEN}Dashboard:${RESET} ${app.url}/`)
    console.log()
    console.log(`${DIM}  Opening browser...${RESET}`)
    console.log(`${DIM}  Ctrl+C to stop${RESET}`)

    // Open browser after a short delay to let the server settle
    setTimeout(() => openBrowser(app.url), 500)

    await new Promise<void>((resolve) => {
      process.once("SIGINT", () => resolve())
      process.once("SIGTERM", () => resolve())
    })
    await app.close()
    console.log(`\n${DIM}stopped${RESET}`)
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}
