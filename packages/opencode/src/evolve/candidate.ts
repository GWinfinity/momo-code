// SPDX-License-Identifier: MIT
// momo Evolve — EvolutionCandidate 契约

export type CandidateKind = "policy" | "decision-checkpoint" | "generator-checkpoint"
export type CandidateStatus =
  | "proposed"
  | "evaluated"
  | "staged"
  | "canary"
  | "active"
  | "rejected"
  | "rolled-back"

export interface EvolutionCandidate {
  id: string
  kind: CandidateKind
  scope: { repoId?: string; language?: string }
  parentVersion: string
  contentHash: string
  evidenceIds: string[]
  questionSetVersion?: string
  datasetVersion?: string
  evaluatorVersion: string
  status: CandidateStatus
  createdAt: string
  evaluatedAt?: string
  stagedAt?: string
  canaryAt?: string
  activatedAt?: string
  rolledBackAt?: string
  rollbackReason?: string
}

export interface PromotionResult {
  accepted: boolean
  action: "promote" | "reject" | "inconclusive"
  metricVersion: string
  baselineVersion: string
  candidateVersion: string
  effectiveSampleSize: number
  keyRegressions: string[]
  interval?: { lower: number; upper: number }
  dataGrouping: string
  reason: string
}

/**
 * Compare-and-swap promotion guard.
 * Only succeeds if the current active parent matches the expected parent.
 */
export function canPromote(
  candidate: EvolutionCandidate,
  currentActiveVersion: string,
): boolean {
  return candidate.parentVersion === currentActiveVersion && candidate.status === "staged"
}
