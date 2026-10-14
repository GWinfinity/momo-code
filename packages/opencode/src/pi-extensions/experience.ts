// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Experience Tactic Injection
// Injects learned tactics from momo Experience Store into Pi agent sessions

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent"
import { Effect, Logger } from "effect"
import {
  InjectForTask,
  SelectorLive,
  InjectorLive,
  ExperienceStoreLive,
} from "../experience/index.js"

/**
 * Pi Extension: before_agent_start hook
 * Injects top-k tactics from momo Experience Store into the agent's system prompt.
 */
export const experienceExtension: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", async (event) => {
    const taskDescription = event.prompt || ""
    if (!taskDescription) return

    try {
      const result = await Effect.runPromise(
        InjectForTask({
          id: `pi_${Date.now()}`,
          description: taskDescription,
          signals: [],
        }).pipe(
          Effect.provide(SelectorLive),
          Effect.provide(InjectorLive),
          Effect.provide(ExperienceStoreLive),
          Effect.provide(Logger.remove(Logger.defaultLogger)),
        ),
      )

      if (result.block && result.block.length > 0) {
        // Log evidence bar (momo style)
        console.error("\n━━ 注入战术 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.error(result.block)
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
        return { systemPrompt: `${event.systemPrompt}\n\n---\n${result.block}` }
      }
    } catch (err) {
      // Tactic injection is best-effort; never block the agent
      console.warn("[momo-experience] Tactic injection failed:", err)
    }
  })
}
