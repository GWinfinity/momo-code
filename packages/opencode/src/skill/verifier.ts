/**
 * The transmission test — ASPIRE's core gate, ported.
 *
 * A proposal only earns its place in the library if a *fresh* agent, given
 * nothing but text — the current library, the proposal, and the task —
 * can re-solve the task. The verifier never sees the proposer's workspace:
 * what is being proven is that the skill text transmits, not that the
 * original program still runs.
 *
 * Pass criterion per trial: child exit code 0 AND the child's final
 * message does not contain the literal `TASK-FAILED` (the prompt instructs
 * the agent to end with that marker when it cannot complete the task).
 *
 * @module skill/verifier
 */

import * as fs from "fs"
import * as path from "path"
import { spawnSubagent, type SpawnOpts, type SubagentResult } from "../subagent/spawn"
import { ALLOWED_CHECK_PREFIXES } from "../experience/guard"
import { listLibraryFiles } from "./lint"
import { librarySha } from "./store"
import type { SkillTask, VerificationReport } from "./schema"

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Injectable child-process runner (tests substitute a fake). */
export type VerificationSpawn = (
  task: string,
  opts: SpawnOpts,
) => Promise<SubagentResult>

export interface VerificationOpts {
  task: SkillTask
  /** Staged proposal file (markdown in skill-entry format). */
  proposalFile: string
  /** Library directory whose current content is inlined into the prompt. */
  libraryDir: string
  /** Number of independent verifier runs (default 1). */
  trials?: number
  /** Reserved for per-trial retries; v1 uses 1 attempt per trial. */
  attempts?: number
  /** Run directory: receives verifier_prompt.md + verification_report.json. */
  outDir: string
  /**
   * Campaign task directory (`<campaignDir>/tasks/<taskId>`). When given,
   * `{task_dir}` placeholders in the check command expand to it in the
   * staged verifier prompt.
   */
  taskDir?: string
  /** Child-process runner (default: the real spawnSubagent). */
  spawn?: VerificationSpawn
}

export interface TrialOutcome {
  pass: boolean
  errored: boolean
}

// ---------------------------------------------------------------------------
// Pure verdict logic (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Assemble the overall verdict from per-trial outcomes.
 *
 * - "void"      — no trial at all, or every trial errored before producing
 *                 output (spawn failure / depth limit / timeout): the run
 *                 is corrupted, not evidence against the proposal.
 * - "verified"  — passes >= ceil(trials / 2)  (majority, so 1/1, 2/3, ...)
 * - "refuted"   — anything else.
 */
export function judgeVerdict(trials: TrialOutcome[]): VerificationReport["verdict"] {
  if (trials.length === 0) return "void"
  if (trials.every((t) => t.errored)) return "void"
  const passes = trials.filter((t) => t.pass).length
  return passes >= Math.ceil(trials.length / 2) ? "verified" : "refuted"
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the self-contained verification prompt. It deliberately contains
 * ONLY: current library content, the proposal, and the task. The
 * prohibitions are part of the test — reading the proposer's artifacts
 * would void the transmission proof.
 */
export function buildVerificationPrompt(opts: {
  libraryDir: string
  proposalFile: string
  task: SkillTask
  /** Campaign task dir; `{task_dir}` in the check expands to it. */
  taskDir?: string
}): string {
  const { libraryDir, proposalFile, task } = opts
  const sha = librarySha(libraryDir)

  const libParts: string[] = []
  for (const file of listLibraryFiles(libraryDir)) {
    libParts.push(`### ${path.basename(file)}\n\n${fs.readFileSync(file, "utf-8").trim()}`)
  }

  const proposal = fs.readFileSync(proposalFile, "utf-8").trim()

  const check = opts.taskDir ? substituteTaskDir(task.check, opts.taskDir) : task.check

  return [
    "# Skill Verification (transmission test)",
    "",
    "You are an independent verifier. You receive ONLY the text in this prompt:",
    "the current skill library, one proposal, and one task. Your job is to",
    "solve the task using the proposal (and the library) as your only",
    "guidance, then confirm success with the task's check command.",
    "",
    "## Prohibitions",
    "",
    "- Do NOT read any files under skill-campaigns/ or the original worker's",
    "  artifacts; use only what is in this prompt.",
    "- Do NOT look for the proposer's solution, workspace, or session logs.",
    "  The point of this test is that the text alone must transmit the skill.",
    "- Do NOT modify any file under the skill library directory.",
    "",
    "## Current skill library (sha " + sha + ")",
    "",
    libParts.length > 0 ? libParts.join("\n\n---\n\n") : "(library is empty)",
    "",
    "## Proposal under verification",
    "",
    proposal,
    "",
    "## Task",
    "",
    `id: ${task.id}`,
    `band: ${task.band}`,
    "",
    task.prompt.trim(),
    "",
    `Check command (run it; exit 0 means success):`,
    "",
    "```sh",
    check,
    "```",
    "",
    "## Contract",
    "",
    "Work the task to completion and run the check command to confirm. If",
    "you cannot complete the task — the proposal is insufficient, wrong, or",
    "unusable — end your final message with the literal marker TASK-FAILED on",
    "its own line. Otherwise your final message must NOT contain TASK-FAILED.",
    "",
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** A trial errored when the child never got to produce real output. */
function trialErrored(result: {
  output: string
  stderrOutput: string
  timedOut: boolean
}): boolean {
  return (
    result.output.startsWith("cannot re-invoke momo") ||
    result.output.startsWith("RLM depth limit reached") ||
    result.stderrOutput.includes("[spawn error:") ||
    result.timedOut
  )
}

/**
 * Narrow aspire-layer exception to the experience guard whitelist: the
 * vendored Genesis sim evaluator. Allowed strictly as
 * `python -m sim_eval ...` / `python3 -m sim_eval ...` — argv[1] must be
 * `-m` and argv[2] exactly `sim_eval`; every other python/python3
 * invocation stays rejected. This exception lives ONLY in the aspire skill
 * layer — experience/guard.ts ALLOWED_CHECK_PREFIXES is untouched.
 */
export function isCheckAllowed(cmd: string): boolean {
  const argv = cmd.trim().split(/\s+/)
  const firstToken = argv[0] ?? ""
  if (
    (firstToken === "python" || firstToken === "python3") &&
    argv[1] === "-m" &&
    argv[2] === "sim_eval"
  ) {
    return true
  }
  return ALLOWED_CHECK_PREFIXES.some(
    (prefix) => firstToken === prefix || firstToken.startsWith(prefix),
  )
}

/**
 * Expand every literal `{task_dir}` occurrence in a task check command to
 * the task's campaign directory. Applied ONLY when the check is staged
 * into an agent prompt (verification prompt, worker/heldout prompt
 * packages) — the raw placeholder stays in tasks.json, campaign.json, and
 * status/log output.
 */
export function substituteTaskDir(check: string, taskDir: string): string {
  return check.split("{task_dir}").join(taskDir)
}

/** Throw when the task check command is outside the guard whitelist. */
export function assertCheckAllowed(check: string): void {
  if (isCheckAllowed(check)) return
  const firstToken = check.trim().split(/\s+/)[0] ?? ""
  throw new Error(
    `task check command '${firstToken}' not in whitelist: ${ALLOWED_CHECK_PREFIXES.join(", ")}`,
  )
}

/**
 * Run the transmission test: one fresh subagent per trial, each given the
 * same self-contained prompt. The prompt is written to
 * `<outDir>/verifier_prompt.md` and the report to
 * `<outDir>/verification_report.json`; the report is also returned.
 *
 * v1 notes (TODO for later phases): the verifier agent does not grade
 * individual proposals structurally, so `proposals` is always empty and a
 * verified report promotes the whole staged package; `gaps` is likewise
 * empty; `attempts` is accepted for forward-compat but each trial uses
 * exactly one attempt.
 */
export async function runVerification(opts: VerificationOpts): Promise<VerificationReport> {
  const trials = Math.max(1, opts.trials ?? 1)
  assertCheckAllowed(opts.task.check)

  const started = Date.now()
  fs.mkdirSync(opts.outDir, { recursive: true })

  const prompt = buildVerificationPrompt(opts)
  const promptFile = path.join(opts.outDir, "verifier_prompt.md")
  const tmpPrompt = `${promptFile}.tmp.${Date.now()}`
  fs.writeFileSync(tmpPrompt, prompt, "utf-8")
  fs.renameSync(tmpPrompt, promptFile)

  const timeoutMs =
    Number(process.env.MOMO_ASPIRE_VERIFY_TIMEOUT_MS || 600_000) || 600_000

  const outcomes: TrialOutcome[] = []
  const exitCodes: number[] = []
  const spawn = opts.spawn ?? spawnSubagent
  for (let i = 0; i < trials; i++) {
    // spawnSubagent increments MOMO_RLM_DEPTH for the child and enforces
    // MOMO_RLM_MAX_DEPTH itself; a depth-limit refusal surfaces as an
    // errored trial (see trialErrored).
    const result = await spawn(prompt, { timeoutMs })
    exitCodes.push(result.exitCode)
    const errored = trialErrored(result)
    const tail = result.output.slice(-2000)
    const pass = !errored && result.exitCode === 0 && !tail.includes("TASK-FAILED")
    outcomes.push({ pass, errored })
  }

  const passes = outcomes.filter((o) => o.pass).length
  const report: VerificationReport = {
    attemptsUsed: trials,
    trials,
    passes,
    verdict: judgeVerdict(outcomes),
    // TODO(phase 2+): per-proposal structural dispositions from the verifier agent.
    proposals: [],
    // TODO(phase 2+): capability gaps observed during verification.
    gaps: [],
    notes: `durationMs=${Date.now() - started} exitCodes=[${exitCodes.join(",")}] prompt=${promptFile}`,
  }

  const reportFile = path.join(opts.outDir, "verification_report.json")
  const tmpReport = `${reportFile}.tmp.${Date.now()}`
  fs.writeFileSync(tmpReport, JSON.stringify(report, null, 2) + "\n", "utf-8")
  fs.renameSync(tmpReport, reportFile)

  return report
}
