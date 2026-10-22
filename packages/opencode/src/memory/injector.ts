// SPDX-License-Identifier: MIT
// momo Code — Hy-Memory integration: render recalled memories for the system
// prompt. Format follows the official `opencode-hy-memory` plugin exactly.

import type { MemoryEntry } from "./types.js"

const LAYER_LABEL: Record<string, string> = {
  l0_basic_info: "profile",
  l4_identity: "profile",
  l6_schema: "profile",
  l7_intention: "intent",
}

/** Map a memory layer to its injection label ("" = no label). */
export function layerLabel(layer?: string): string {
  if (!layer) return ""
  return LAYER_LABEL[layer.toLowerCase()] ?? ""
}

/** Render the `<user_memory>` block. Returns "" for an empty list. */
export function renderUserMemoryBlock(entries: readonly MemoryEntry[]): string {
  if (!entries || entries.length === 0) return ""
  const lines: string[] = []
  for (const m of entries) {
    const content = (m.content ?? "").trim()
    if (!content) continue
    const label = layerLabel(m.layer)
    lines.push(label ? `§ [${label}] ${content}` : `§ ${content}`)
  }
  if (lines.length === 0) return ""
  return [
    "<user_memory>",
    "The following long-term memories about the user were retrieved and may be relevant. Use them only when pertinent; do not fabricate beyond them.",
    "",
    ...lines,
    "</user_memory>",
  ].join("\n")
}
