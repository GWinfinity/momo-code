// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: throttled passive write-back.
// Turns are buffered and flushed to the server every N turns (and at session
// end) so memory extraction cost stays bounded. All failures are swallowed.

import type { MemoryClient } from "./client.js"
import type { MemoryMessage } from "./types.js"

export class MemoryCapture {
  private pending: MemoryMessage[] = []
  private turns = 0

  constructor(
    private readonly client: MemoryClient,
    private readonly sessionId: string,
    private readonly turnWindow: number,
  ) {}

  /** Buffer one user/assistant turn. */
  addTurn(user: string, assistant: string): void {
    const u = user.trim()
    const a = assistant.trim()
    if (!u && !a) return
    if (u) this.pending.push({ role: "user", content: u })
    if (a) this.pending.push({ role: "assistant", content: a })
    this.turns += 1
  }

  /** Number of buffered turns since the last flush (for tests / status). */
  get pendingTurns(): number {
    return this.turns
  }

  /** Flush once the turn window is reached. */
  async maybeFlush(): Promise<void> {
    if (this.turns >= this.turnWindow) await this.flush()
  }

  /** Write back everything buffered. No-op when empty. */
  async flush(): Promise<void> {
    if (this.pending.length === 0) return
    const messages = this.pending
    this.pending = []
    this.turns = 0
    try {
      await this.client.add(messages, { sessionId: this.sessionId })
    } catch {
      // Write-back is best-effort; drop the batch on failure.
    }
  }
}
