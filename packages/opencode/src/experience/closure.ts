// SPDX-License-Identifier: MIT
// momo Experience — TaskExposure → TaskOutcome → Solidify 闭环

import type { TaskResult, TaskStatus } from "../runtime/types.js"

export interface TaskExposure {
  taskId: string
  attemptId: string
  policyVersion: string
  injectedTacticIds: string[]
  injectionReasons: string[] // per tactic: "thompson" | "jev-relevant" | "cold-start"
  tokenCost: number
  timestamp: string
}

export interface TaskOutcome {
  taskId: string
  attemptId: string
  status: TaskStatus
  verificationPassed?: boolean
  toolStepCount: number
  latencyMs: number
  // Co-exposure: all tactics injected together share the outcome
  // Individual causation requires controlled experiment
  coexposed: boolean
}

export interface SolidifyRecord {
  taskId: string
  exposure: TaskExposure
  outcome: TaskOutcome
  // Attribution policy
  attribution: "coexposed" | "independent" | "unknown"
  legacyEvidence?: boolean
}

/**
 * Solidify: idempotent update of Case/Ledger from a completed task.
 * - Does NOT claim individual tactic causation for co-exposed tactics
 * - Cancels/infra errors do NOT add wins/losses
 * - Repeated settled events update the same record (idempotent)
 */
export function solidify(
  exposure: TaskExposure,
  outcome: TaskOutcome,
): SolidifyRecord {
  // Determine attribution
  const attribution: SolidifyRecord["attribution"] =
    exposure.injectedTacticIds.length > 1
      ? "coexposed"
      : exposure.injectedTacticIds.length === 1
        ? "independent"
        : "unknown"

  // Only record outcomes for tasks that reached a definite conclusion
  const definite = ["succeeded", "failed"].includes(outcome.status)
  if (!definite) {
    return {
      taskId: exposure.taskId,
      exposure,
      outcome,
      attribution: "unknown",
    }
  }

  return {
    taskId: exposure.taskId,
    exposure,
    outcome,
    attribution,
  }
}

/**
 * Update tactic statistics from solidify records.
 * For co-exposed tactics, update `evaluatedUses` but NOT `wins/losses`
 * until independent evidence is available.
 */
export function updateTacticStats(
  record: SolidifyRecord,
  existingStats: {
    wins: number
    losses: number
    alpha: number
    beta: number
    evaluatedUses: number
    inconclusiveUses: number
  },
): typeof existingStats {
  const next = { ...existingStats }

  next.evaluatedUses++

  if (record.attribution === "coexposed") {
    // Co-exposed: count as evaluated but NOT as win/loss
    // Slow-loop controlled experiment needed for causal claim
    return next
  }

  if (record.attribution === "independent") {
    if (record.outcome.status === "succeeded") {
      next.wins++
      next.alpha++
    } else if (record.outcome.status === "failed") {
      next.losses++
      next.beta++
    }
    return next
  }

  // Unknown attribution
  next.inconclusiveUses++
  return next
}
