// SPDX-License-Identifier: MIT
// momo REPL — Keyboard Handler
// ⌃T: toggle CoT | ⌃O: toggle tools | ⌃C: interrupt

import readline from "readline"

export type KeyHandler = () => void

export interface KeyMap {
  "\x14": KeyHandler // ⌃T — toggle CoT
  "\x0f": KeyHandler // ⌃O — toggle tools
  "\x03": KeyHandler // ⌃C — interrupt
}

export function setupKeyboardHandlers(handlers: Partial<KeyMap>): void {
  if (!process.stdin.isTTY) return

  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)

  process.stdin.on("keypress", (_str, key) => {
    if (!key) return

    // Convert ctrl+key to control character (e.g., ctrl+t -> \x14)
    const ctrlChar =
      key.ctrl && key.name && key.name.length === 1
        ? String.fromCharCode(key.name.charCodeAt(0) - 96)
        : null

    if (ctrlChar && handlers[ctrlChar as keyof KeyMap]) {
      handlers[ctrlChar as keyof KeyMap]!()
    }

    // Ctrl+C always exits
    if (key.ctrl && key.name === "c") {
      process.stdout.write("\n")
      process.exit(0)
    }
  })
}

export function restoreTerminal(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}
