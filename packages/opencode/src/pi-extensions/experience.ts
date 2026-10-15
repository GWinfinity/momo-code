// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: Experience Tactic Injection
// Injects learned tactics from momo Experience Store into Pi agent sessions

import type { InlineExtension } from "@earendil-works/pi-coding-agent"
import { Effect } from "effect"
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
export const experienceExtension: InlineExtension = {
  name: "momo-experience",

  factory: (pi) => {
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
          ),
        )

        if (result.block && result.block.length > 0) {
          // Append tactic block to the system prompt
          event.systemPromptOptions.appendSystemPrompt =
            event.systemPromptOptions.appendSystemPrompt
              ? `${event.systemPromptOptions.appendSystemPrompt}\n\n---\n${result.block}`
              : result.block

          // Log evidence bar (momo style)
          console.error("\n━━ 注入战术 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
          console.error(result.block)
          console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

          // The runtime rebuilds the system prompt from the mutated options
        }
      } catch (err) {
        // Tactic injection is best-effort; never block the agent
        console.warn("[momo-experience] Tactic injection failed:", err)
      }
    })
  },
}
