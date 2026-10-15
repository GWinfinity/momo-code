// SPDX-License-Identifier: MIT
// momo REPL — Decision Capsule Renderer
// Shows L0 decision confidence inline (momo style)

export interface DecisionCapsule {
  gate: string
  confidence: number
  latencyMs: number
  action: "pass" | "block" | "abstain"
  reason: string
}

export function renderDecisionCapsule(capsule: DecisionCapsule): string {
  const icon = capsule.action === "pass" ? "✓" : capsule.action === "block" ? "⊘" : "⚠"
  const color =
    capsule.action === "pass"
      ? "\x1b[32m"
      : capsule.action === "block"
        ? "\x1b[31m"
        : "\x1b[33m"
  const reset = "\x1b[0m"

  return `${color}${icon}${reset} ${capsule.gate} ${capsule.confidence.toFixed(2)} → ${capsule.reason} · ${capsule.latencyMs}ms`
}

export function renderDecisionBar(capsules: DecisionCapsule[]): void {
  if (!process.stderr.isTTY) return
  if (process.env.MOMO_UI_DECISION_CHIPS !== "true") return

  process.stderr.write("\n")
  for (const c of capsules) {
    process.stderr.write("  " + renderDecisionCapsule(c) + "\n")
  }
  process.stderr.write("\n")
}

/**
 * Evidence bar — shows injected tactics with win rates
 */
export interface EvidenceItem {
  name: string
  winRate: number
  alpha: number
  beta: number
  verdict: "pass" | "fail"
}

export function renderEvidenceBar(items: EvidenceItem[]): void {
  if (!process.stderr.isTTY) return
  if (process.env.MOMO_UI_EVIDENCE_BAR !== "true") return
  if (items.length === 0) return

  process.stderr.write("\n━━ 注入战术 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
  for (const item of items) {
    const icon = item.verdict === "pass" ? "✓" : "✗"
    const rate = ((item.winRate || 0) * 100).toFixed(0)
    process.stderr.write(
      `  ${icon} ${item.name}  胜率 ${rate}% (${item.alpha}/${item.alpha + item.beta}) → ${item.verdict}\n`,
    )
  }
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")
}
