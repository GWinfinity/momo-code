/**
 * Skill subsystem data model — port of ASPIRE's skill_report.json /
 * verification_report.json shapes into momo-code's coding-agent context.
 *
 * The skill library is the only trusted cross-task channel: entries are
 * Trigger → Code → Evidence markdown, versioned by a content hash
 * (`skillLibrarySha`). Workers propose, an independent verifier gate
 * promotes — nothing enters the library without a verified transmission
 * test (see verifier.ts).
 *
 * @module skill/schema
 */

/** Verdict vocab for `consulted` grades in a SkillReport. */
export const VERDICTS = ["useful", "misleading", "wrong", "not-applicable"] as const
export type Verdict = (typeof VERDICTS)[number]

/** Disposition vocab for per-proposal verdicts in a VerificationReport. */
export const DISPOSITIONS = ["sound", "defective", "untested"] as const
export type Disposition = (typeof DISPOSITIONS)[number]

/** Overall verdict vocab for a VerificationReport. */
export const VERIFICATION_VERDICTS = ["verified", "refuted", "void"] as const
export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number]

/**
 * A worker's report to the coordinator (port of ASPIRE skill_report.json).
 *
 * `skillLibrarySha` records which library version the worker read, so a
 * rerun can tell which library produced this report.
 */
export interface SkillReport {
  /** Content hash (16 hex chars) of the library the worker consulted. */
  readonly skillLibrarySha: string
  /** Grades for entries the worker actually used. */
  readonly consulted: ReadonlyArray<{
    skill: string
    section: string
    verdict: Verdict
    evidence: string
  }>
  /** Prose edit suggestions against existing entries. */
  readonly proposedEdits: ReadonlyArray<{
    skill: string
    section: string
    change: string
    why: string
  }>
  /** Fully-formed new entries, ready to stage for verification. */
  readonly proposedNew: ReadonlyArray<{
    /** Target skill file (e.g. "arrays" → arrays.md), existing or new. */
    skill: string
    title: string
    trigger: string
    code: string
    evidence: string
  }>
}

/**
 * A verifier's report (port of ASPIRE verification_report.json).
 *
 * Produced by the transmission test: a fresh agent receives only the
 * library text + proposal + task, and must re-solve the task.
 */
export interface VerificationReport {
  attemptsUsed: number
  trials: number
  passes: number
  verdict: VerificationVerdict
  /** Per-proposal structural grading (empty in v1 — see verifier.ts TODO). */
  proposals: Array<{ title: string; disposition: Disposition; note: string }>
  gaps: string[]
  notes: string
}

/**
 * Immutable campaign manifest (identity-hashed).
 *
 * Phase 2 (coordinator.ts) writes one per campaign run; Phase 1 defined the
 * type only. `runId` = sha256(canonical(identity))[:16] so a mutated task
 * set or library can never present itself as a previous run.
 *
 * Lifecycle per task: pending → running → done | failed. A task whose
 * worker report is missing/invalid goes back to pending with `retries`
 * incremented, up to 2 retries, then failed. Heldout tasks skip the
 * proposal pipeline: they become done with passes 0/1.
 */
export interface CampaignManifest {
  schemaVersion: 1
  runId: string
  identity: {
    librarySha: string
    taskSetSha: string
    model: string
  }
  tasks: Record<
    string,
    {
      status: "pending" | "running" | "done" | "failed"
      passes: number
      trials: number
      /** Worker-report retries used (max 2, then the task is failed). */
      retries?: number
    }
  >
}

/**
 * A coding-task "seed": prompt + acceptance check command + band.
 *
 * `check` must start with a whitelisted prefix (reuse of
 * experience/guard.ts ALLOWED_CHECK_PREFIXES), except the narrow
 * `python -m sim_eval ...` sim-evaluator exception owned by
 * verifier.ts isCheckAllowed.
 */
export interface SkillTask {
  id: string
  /** Task description handed to the worker/verifier. */
  prompt: string
  /**
   * Acceptance command whose exit 0 means success. Normally a whitelisted
   * prefix; the only exception is `python -m sim_eval ...` /
   * `python3 -m sim_eval ...`. Literal `{task_dir}` placeholders expand to
   * the task's campaign directory when staged into agent prompts.
   */
  check: string
  /** dev tasks drive proposals; heldout tasks guard final claims. */
  band: "dev" | "heldout"
}

/** One Trigger → Code → Evidence entry in a skill library file. */
export interface SkillEntry {
  /** Owning skill file name without extension (e.g. "arrays"). */
  skill: string
  /** Entry heading (`### <title>` in the markdown). */
  title: string
  trigger: string
  code: string
  evidence: string
}
