// SPDX-License-Identifier: MIT
// momo TaskRuntime — 任务类型与事件信封

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_user"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "inconclusive"

export interface TaskResult {
  taskId: string
  attemptId: string
  parentTaskId?: string
  branchVersion: string
  status: TaskStatus
  createdAt: string
  settledAt?: string
  toolEvents: ToolEvent[]
  verification?: VerificationResult
  policyVersion: string
  questionSetVersion?: string
  decisionModel?: string
  generatorModel: string
  evaluatorVersion?: string
  budgetUsed: { toolSteps: number; wallMs: number; costUsd?: number }
}

export interface ToolEvent {
  seq: number
  toolCallId: string
  toolName: string
  input: unknown
  output?: unknown
  exitCode?: number
  isError: boolean
  latencyMs: number
  timestamp: string
}

export interface VerificationResult {
  version: string
  passed: boolean
  summary: string
  details: unknown
  verifierExecutable: string
  verifierArgs: string[]
  artifactHash?: string
}

// ── 事件信封 ──────────────────────────────────────────────────────

export type EventOrigin =
  | "user"
  | "agent"
  | "tool"
  | "decision"
  | "evolution"
  | "system"

export interface EventEnvelope {
  schemaVersion: number
  eventId: string
  seq: number
  timestamp: string
  sessionId: string
  taskId: string
  attemptId: string
  parentTaskId?: string
  branchVersion: string
  origin: EventOrigin
  policyVersion: string
}

export interface TaskStartedEvent extends EventEnvelope {
  type: "task_started"
  prompt: string
  scope: { repoId?: string; language?: string }
  lockedPolicyVersion: string
  lockedGeneratorModel: string
}

export interface ToolStartedEvent extends EventEnvelope {
  type: "tool_started"
  toolCallId: string
  toolName: string
  input: unknown
}

export interface ToolFinishedEvent extends EventEnvelope {
  type: "tool_finished"
  toolCallId: string
  toolName: string
  output?: unknown
  exitCode?: number
  isError: boolean
  latencyMs: number
}

export interface DecisionResultEvent extends EventEnvelope {
  type: "decision_result"
  decisionRequestId: string
  gate: string
  disposition: "use" | "abstain"
  reason: string
  latencyMs: number
}

export interface TaskFinishedEvent extends EventEnvelope {
  type: "task_finished"
  status: TaskStatus
  resultRef: string
}

export interface CandidateCreatedEvent extends EventEnvelope {
  type: "candidate_created"
  experimentId: string
  candidateId: string
  kind: string
  parentVersion: string
}

export interface PolicyActivatedEvent extends EventEnvelope {
  type: "policy_activated"
  policyVersion: string
  previousVersion: string
  reason: string
}

export interface PolicyRolledBackEvent extends EventEnvelope {
  type: "policy_rolled_back"
  policyVersion: string
  rollbackOf: string
  reason: string
}

export type MomoEvent =
  | TaskStartedEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | DecisionResultEvent
  | TaskFinishedEvent
  | CandidateCreatedEvent
  | PolicyActivatedEvent
  | PolicyRolledBackEvent
