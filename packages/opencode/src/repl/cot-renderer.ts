// SPDX-License-Identifier: MIT
// momo REPL — Chain-of-Thought Renderer
// Collapsed/expanded modes + paragraph boundary detection

export interface CoTStep {
  number: number
  action: string
  detail?: string
}

export class CoTRenderer {
  private steps: CoTStep[] = []
  private expanded = false

  addStep(step: CoTStep): void {
    this.steps.push(step)
    if (this.expanded) {
      this.renderStep(step)
    }
  }

  toggle(): void {
    this.expanded = !this.expanded
    if (this.expanded) {
      this.renderAll()
    } else {
      this.renderSummary()
    }
  }

  private renderStep(step: CoTStep): void {
    const detail = step.detail ? `  ${step.detail}` : ""
    process.stderr.write(`  ${step.number}. ${step.action}${detail}\n`)
  }

  private renderAll(): void {
    process.stderr.write("\n🧠 Thinking...\n")
    for (const step of this.steps) {
      this.renderStep(step)
    }
  }

  private renderSummary(): void {
    process.stderr.write(`\n🧠 Thinking... (${this.steps.length} steps, ⌃T to expand)\n`)
  }

  start(): void {
    this.steps = []
    if (!this.expanded) {
      this.renderSummary()
    }
  }

  finish(): void {
    if (!this.expanded) {
      // In collapsed mode, show final conclusion only
      const last = this.steps[this.steps.length - 1]
      if (last) {
        process.stderr.write(`  → ${last.action}\n`)
      }
    }
  }
}

/**
 * Detect paragraph boundaries in raw thinking text.
 * Uses heuristics: blank lines, numbered lists, transition words.
 */
export function splitThinkingIntoSteps(text: string): CoTStep[] {
  const lines = text.split(/\n+/)
  const steps: CoTStep[] = []
  let stepNum = 1
  let buffer = ""

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Heuristic: numbered list or transition words indicate new step
    const isNewStep =
      /^\d+[.):]/.test(trimmed) ||
      /^(First|Second|Third|Next|Then|Finally|Now|Let me|I need to|I'll|I will)/i.test(trimmed)

    if (isNewStep && buffer) {
      steps.push({ number: stepNum++, action: buffer.trim() })
      buffer = trimmed
    } else {
      buffer += " " + trimmed
    }
  }

  if (buffer) {
    steps.push({ number: stepNum, action: buffer.trim() })
  }

  return steps
}
