// SPDX-License-Identifier: MIT
// momo JEV — Judgment-Evaluation-Verification Decision Layer
// L0 fast decision model with shadow mode + calibration

import fs from "fs"
import path from "path"
import { getConfigDir } from "../config/config.js"

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

// ── Bamboo Relay / StartLux backend ───────────────────────────────

export const STARTLUX_DEFAULT_BASE_URL = "https://api.bamboonode.dev"
export const STARTLUX_DEFAULT_MODEL = "startlux-decision-27b-autothink"
/** StartLux `state` is token-metered upstream; keep contexts bounded. */
export const MAX_STATE_CHARS = 6000
/** Official guidance: none_probability >= 0.2 means no listed option fits. */
export const DEFAULT_NONE_THRESHOLD = 0.2

export interface BamboonodeBackendOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
  timeoutMs?: number
  thinkMode?: "auto" | "never" | "always"
  noneThreshold?: number
}

export interface StartluxQuestion {
  type: "choice" | "noul"
  instructions: string
  criteria?: Record<string, string>
}

export interface StartluxAnswerRaw {
  type?: string
  choice?: string | null
  confidence?: number
  none_probability?: number
  noul?: number
}

export function buildStartluxQuestions(
  questions: DecisionQuestion[],
): Record<string, StartluxQuestion> {
  const out: Record<string, StartluxQuestion> = {}
  for (const q of questions) {
    if (q.options && q.options.length > 0) {
      const criteria: Record<string, string> = {}
      for (const o of q.options) criteria[o.value] = o.label
      out[q.id] = { type: "choice", instructions: q.context, criteria }
    } else {
      out[q.id] = { type: "noul", instructions: q.context }
    }
  }
  return out
}

export function mapStartluxAnswer(
  q: DecisionQuestion,
  raw: StartluxAnswerRaw | undefined,
  latencyMs: number,
  noneThreshold: number = DEFAULT_NONE_THRESHOLD,
): DecisionAnswer {
  const abstain = (): DecisionAnswer => ({
    questionId: q.id,
    chosen: "abstain",
    confidence: 0,
    abstained: true,
    latencyMs,
  })
  if (!raw) return abstain()

  if (typeof raw.choice === "string" || raw.choice === null) {
    if (raw.choice === null) return abstain()
    if (
      typeof raw.none_probability === "number" &&
      raw.none_probability >= noneThreshold
    ) {
      return abstain()
    }
    if (
      q.options &&
      q.options.length > 0 &&
      !q.options.some((o) => o.value === raw.choice)
    ) {
      return abstain()
    }
    const confidence =
      typeof raw.confidence === "number"
        ? Math.min(Math.max(raw.confidence, 0), 1)
        : 0
    return { questionId: q.id, chosen: raw.choice, confidence, abstained: false, latencyMs }
  }

  // noul: probability of "yes", not a boolean
  if (typeof raw.noul === "number") {
    const p = Math.min(Math.max(raw.noul, 0), 1)
    return {
      questionId: q.id,
      chosen: p >= 0.5 ? "yes" : "no",
      confidence: Math.max(p, 1 - p),
      abstained: false,
      latencyMs,
    }
  }

  return abstain()
}

function abstainAll(questions: DecisionQuestion[], latencyMs: number = 0): DecisionAnswer[] {
  return questions.map((q) => ({
    questionId: q.id,
    chosen: "abstain",
    confidence: 0,
    abstained: true,
    latencyMs,
  }))
}

/**
 * Bamboo Relay backend: StartLux decision models via
 * POST {baseUrl}/v1/decisions (alias /v1/systemone).
 * Any transport/error condition abstains so the caller falls back
 * to the LLM/human decision path.
 */
export function createBamboonodeBackend(
  opts: BamboonodeBackendOptions = {},
): JEVBackend {
  const baseUrl = (opts.baseUrl || STARTLUX_DEFAULT_BASE_URL).replace(/\/+$/, "")
  const model = opts.model || STARTLUX_DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs ?? 1500
  const thinkMode = opts.thinkMode ?? "auto"
  const noneThreshold = opts.noneThreshold ?? DEFAULT_NONE_THRESHOLD

  return {
    name: "bamboonode",
    ask: async (context, questions) => {
      if (!opts.apiKey) return abstainAll(questions)
      const state =
        context.length > MAX_STATE_CHARS
          ? context.slice(0, MAX_STATE_CHARS)
          : context
      const started = Date.now()
      try {
        const res = await fetch(`${baseUrl}/v1/decisions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            state,
            questions: buildStartluxQuestions(questions),
            think_mode: thinkMode,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!res.ok) return abstainAll(questions, Date.now() - started)
        const data = (await res.json()) as {
          answers?: Record<string, StartluxAnswerRaw>
        }
        const latencyMs = Date.now() - started
        return questions.map((q) =>
          mapStartluxAnswer(q, data.answers?.[q.id], latencyMs, noneThreshold),
        )
      } catch {
        return abstainAll(questions, Date.now() - started)
      }
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

// ── Shadow mode recorder ──────────────────────────────────────────

export type JEVRawLogging = "full" | "redacted" | "none"

export interface ShadowRecorderOptions {
  path?: string
  rawLogging?: JEVRawLogging
}

function redactSecrets(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s&]+/gi, "$1[REDACTED]")
}

export class ShadowRecorder {
  private records: ShadowRecord[] = []

  constructor(private opts: ShadowRecorderOptions = {}) {}

  record(r: ShadowRecord): void {
    this.records.push(r)

    const logPath = this.opts.path ?? path.join(getConfigDir(), "jev-shadow.jsonl")
    const rawLogging = this.opts.rawLogging ?? "redacted"
    if (rawLogging === "none") return
    const line = rawLogging === "redacted" ? { ...r, context: redactSecrets(r.context) } : r
    try {
      fs.appendFileSync(logPath, JSON.stringify(line) + "\n", "utf-8")
    } catch {
      // Logging must never break the decision flow
    }
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
  private mode: "shadow" | "enforce" | "off"
  private activeGates: Set<DecisionGate>

  constructor(opts: {
    backend?: JEVBackend
    mode?: "shadow" | "enforce" | "off"
    gates?: DecisionGate[]
    shadowLog?: ShadowRecorderOptions
  } = {}) {
    this.backend = opts.backend || createNoopBackend()
    this.recorder = new ShadowRecorder(opts.shadowLog)
    this.mode = opts.mode || "shadow"
    this.activeGates = new Set(opts.gates || [])
  }

  getBackendName(): string {
    return this.backend.name
  }

  getMode(): "shadow" | "enforce" | "off" {
    return this.mode
  }

  getGates(): DecisionGate[] {
    return [...this.activeGates]
  }

  private abstainFor(questions: DecisionQuestion[]): DecisionAnswer[] {
    return questions.map((q) => ({
      questionId: q.id,
      chosen: "abstain",
      confidence: 0,
      abstained: true,
      latencyMs: 0,
    }))
  }

  private recordAll(
    gate: DecisionGate,
    context: string,
    answers: DecisionAnswer[],
    llmDecision: string,
  ): void {
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
  }

  /**
   * Shadow instrumentation: ask the backend, record both sides, and
   * return the backend's real answers (used for chips / ECE analysis).
   * Never overrides the LLM decision.
   */
  async probe(
    gate: DecisionGate,
    context: string,
    questions: DecisionQuestion[],
    llmDecision: string,
  ): Promise<DecisionAnswer[]> {
    if (this.mode === "off" || !this.activeGates.has(gate)) {
      return this.abstainFor(questions)
    }
    const answers = await this.backend.ask(context, questions)
    this.recordAll(gate, context, answers, llmDecision)
    return answers
  }

  async decide(
    gate: DecisionGate,
    context: string,
    questions: DecisionQuestion[],
    llmDecision: string,
  ): Promise<DecisionAnswer[]> {
    // If gate not activated (or JEV off), return abstained
    if (this.mode === "off" || !this.activeGates.has(gate)) {
      return this.abstainFor(questions)
    }

    const answers = await this.backend.ask(context, questions)
    this.recordAll(gate, context, answers, llmDecision)

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
