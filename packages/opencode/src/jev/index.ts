// SPDX-License-Identifier: MIT
// momo JEV — Judgment-Evaluation-Verification Decision Layer
// L0 fast decision model with shadow mode + calibration

export interface DecisionQuestion {
  id: string
  context: string
  options: { label: string; value: string }[]
}

export interface DecisionAnswer {
  questionId: string
  chosen: string
  confidence: number // 0.0 – 1.0
  abstained: boolean // true → fall back to L1 / LLM / human
  latencyMs: number
}

export interface DecisionPort {
  readonly ask: (
    context: string,
    questions: DecisionQuestion[],
  ) => Promise<DecisionAnswer[]>
}

// ── Decision gates (5 points) ─────────────────────────────────────

export type DecisionGate =
  | "tool"      // ① Tool gate: allow / confirm / block
  | "tactic"    // ② Tactic gate: inject or not
  | "route"     // ③ Model route: ultra / standard / lite
  | "diff"      // ④ Diff gate: auto-apply or human review
  | "promote"   // ⑤ Promote gate: A/B result judgment

// ── Backends ──────────────────────────────────────────────────────

export interface JEVBackend {
  name: string
  ask: (context: string, questions: DecisionQuestion[]) => Promise<DecisionAnswer[]>
}

/**
 * No-op backend: returns abstained for all questions.
 * Default when no decision model is configured.
 */
export function createNoopBackend(): JEVBackend {
  return {
    name: "noop",
    ask: async (_ctx, questions) =>
      questions.map((q) => ({
        questionId: q.id,
        chosen: "abstain",
        confidence: 0.0,
        abstained: true,
        latencyMs: 0,
      })),
  }
}

/**
 * KEV backend (HuggingFace, Apache-2.0)
 * Primary recommendation: supports self-training.
 */
export function createKevBackend(url: string): JEVBackend {
  return {
    name: "kev",
    ask: async (context, questions) => {
      // In production: HTTP POST to KEV server
      // For now: [SIMULATED] shadow mode
      console.warn("[JEV-KEV] Shadow mode — recording, not deciding")
      return questions.map((q) => ({
        questionId: q.id,
        chosen: "abstain",
        confidence: 0.0,
        abstained: true,
        latencyMs: 0,
      }))
    },
  }
}

/**
 * Laya backend (MLX, Apache-2.0)
 * Mac local inference: 7.4ms latency.
 */
export function createLayaBackend(modelPath: string): JEVBackend {
  return {
    name: "laya-mlx",
    ask: async (context, questions) => {
      // In production: MLX Python subprocess
      // For now: [SIMULATED]
      console.warn("[JEV-LAYA] Shadow mode — recording, not deciding")
      return questions.map((q) => ({
        questionId: q.id,
        chosen: "abstain",
        confidence: 0.0,
        abstained: true,
        latencyMs: 0,
      }))
    },
  }
}

// ── Shadow mode recorder ──────────────────────────────────────────

interface ShadowRecord {
  timestamp: string
  gate: DecisionGate
  context: string
  backend: string
  answer: DecisionAnswer
  llmDecision: string // What the LLM actually decided
}

export class ShadowRecorder {
  private records: ShadowRecord[] = []

  record(r: ShadowRecord): void {
    this.records.push(r)
    // In production: append to ~/.momo/jev-shadow.jsonl
  }

  getRecords(): ShadowRecord[] {
    return this.records
  }

  // Calibration: compute ECE (Expected Calibration Error)
  computeECE(bins: number = 10): number {
    // Group by confidence bins
    const binRecords: ShadowRecord[][] = Array.from({ length: bins }, () => [])
    for (const r of this.records) {
      const binIdx = Math.min(Math.floor(r.answer.confidence * bins), bins - 1)
      binRecords[binIdx].push(r)
    }

    let ece = 0
    for (const bin of binRecords) {
      if (bin.length === 0) continue
      const avgConfidence = bin.reduce((s, r) => s + r.answer.confidence, 0) / bin.length
      const accuracy = bin.filter((r) => r.answer.chosen === r.llmDecision).length / bin.length
      ece += (bin.length / this.records.length) * Math.abs(avgConfidence - accuracy)
    }

    return ece
  }
}

// ── JEV Orchestrator ──────────────────────────────────────────────

export class JEVEngine {
  private backend: JEVBackend
  private recorder: ShadowRecorder
  private mode: "shadow" | "enforce"
  private activeGates: Set<DecisionGate>

  constructor(opts: {
    backend?: JEVBackend
    mode?: "shadow" | "enforce"
    gates?: DecisionGate[]
  } = {}) {
    this.backend = opts.backend || createNoopBackend()
    this.recorder = new ShadowRecorder()
    this.mode = opts.mode || "shadow"
    this.activeGates = new Set(opts.gates || [])
  }

  async decide(
    gate: DecisionGate,
    context: string,
    questions: DecisionQuestion[],
    llmDecision: string,
  ): Promise<DecisionAnswer[]> {
    // If gate not activated, return abstained
    if (!this.activeGates.has(gate)) {
      return questions.map((q) => ({
        questionId: q.id,
        chosen: "abstain",
        confidence: 0,
        abstained: true,
        latencyMs: 0,
      }))
    }

    const answers = await this.backend.ask(context, questions)

    // Record for shadow mode
    for (const ans of answers) {
      this.recorder.record({
        timestamp: new Date().toISOString(),
        gate,
        context,
        backend: this.backend.name,
        answer: ans,
        llmDecision,
      })
    }

    // In shadow mode: return LLM decision (ignore JEV)
    if (this.mode === "shadow") {
      return questions.map((q) => ({
        questionId: q.id,
        chosen: llmDecision,
        confidence: 0,
        abstained: true,
        latencyMs: 0,
      }))
    }

    // In enforce mode: use JEV decision if not abstained
    return answers.map((ans) => {
      if (ans.abstained) {
        return { ...ans, chosen: llmDecision }
      }
      return ans
    })
  }

  getECE(): number {
    return this.recorder.computeECE()
  }

  getRecordCount(): number {
    return this.recorder.getRecords().length
  }
}
