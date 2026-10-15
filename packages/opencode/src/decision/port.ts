// SPDX-License-Identifier: MIT
// momo DecisionPort — 决策层类型契约
// 适配 TypeSafe Jev / Kev / Laya / 规则降级

export type DecisionAnswerKind = "choice" | "bool" | "score" | "abstain"

export interface DecisionAnswerChoice {
  kind: "choice"
  value: string
  probabilities: Record<string, number>
  selectedProbability: number
  providerConfidence?: number
}

export interface DecisionAnswerBool {
  kind: "bool"
  probabilityTrue: number
  providerConfidence?: number
}

export interface DecisionAnswerScore {
  kind: "score"
  value: number
  levels: string[]
  probabilities?: number[]
  providerConfidence?: number
}

export interface DecisionAnswerAbstain {
  kind: "abstain"
  reason: "uncertain" | "stale" | "service-error" | "no-match" | "timeout" | "cancelled"
}

export type DecisionAnswer =
  | DecisionAnswerChoice
  | DecisionAnswerBool
  | DecisionAnswerScore
  | DecisionAnswerAbstain

export interface DecisionQuestion {
  id: string
  text: string
  type: "choice" | "bool" | "score"
  options?: { label: string; value: string }[]
  criteria?: { trueText?: string; falseText?: string }
  levels?: string[]
}

export interface DecisionRequest {
  requestId: string
  taskId: string
  scope: { repoId?: string; language?: string }
  stateVersion: string
  stateHash: string
  questions: DecisionQuestion[]
  candidateSetHash?: string
  deadlineMs: number
}

export interface DecisionResponse {
  requestId: string
  stateHash: string
  questionSetVersion: string
  requestedModel: string
  resolvedModel?: string
  checkpointHash?: string
  calibrationVersion?: string
  answers: Record<string, DecisionAnswer>
  status: "ok" | "unavailable" | "timeout" | "cancelled" | "invalid"
  latencyMs: number
  inputTokens?: number
  rawArtifactRef?: string
}

export interface DecisionDisposition {
  action: "use" | "abstain"
  reason: "accepted" | "no-match" | "uncertain" | "stale" | "service-error"
  policyVersion: string
}

export interface DecisionCapabilities {
  provider: string
  models: string[]
  questionTypes: ("choice" | "bool" | "score")[]
  maxStateLength: number
  maxOptions: number
  returnsLogits: boolean
  returnsProbabilities: boolean
  supportsTraining: boolean
  supportsFixedCheckpoint: boolean
}

export interface DecisionPort {
  readonly name: string
  capabilities(): Promise<DecisionCapabilities>
  evaluate(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse>
  close(): Promise<void>
}

// ── 规则降级适配器 ────────────────────────────────────────────────

export function createRulesDecisionAdapter(): DecisionPort {
  return {
    name: "rules",

    async capabilities() {
      return {
        provider: "rules",
        models: ["deterministic"],
        questionTypes: ["choice", "bool"],
        maxStateLength: 4096,
        maxOptions: 10,
        returnsLogits: false,
        returnsProbabilities: false,
        supportsTraining: false,
        supportsFixedCheckpoint: true,
      }
    },

    async evaluate(request, _signal) {
      // Rule-based: abstain everything — dispatcher falls back to default
      const answers: Record<string, DecisionAnswer> = {}
      for (const q of request.questions) {
        answers[q.id] = { kind: "abstain", reason: "no-match" }
      }
      return {
        requestId: request.requestId,
        stateHash: request.stateHash,
        questionSetVersion: "rules-v1",
        requestedModel: "rules",
        answers,
        status: "ok",
        latencyMs: 0,
      }
    },

    async close() {},
  }
}
