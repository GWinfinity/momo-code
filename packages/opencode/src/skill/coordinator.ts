/**
 * Campaign runner (v1 synchronous batch) — port of ASPIRE campaign.py's
 * coordinator loop, simplified from the event-driven go-idle design to
 * blocking batches: dispatch → await all → collect → gate → apply → repeat.
 *
 * Roles are strictly separated:
 * - workers write ONLY their task directory and produce skill_report.json;
 * - the lint + transmission-test gate (Phase 1) decides what is sound;
 * - the coordinator is the ONLY library writer (store.applyVerified).
 *
 * Two-band protocol (audit_seeding.py disjointness port): at least one dev
 * and one heldout task, and the bands must not overlap. Dev tasks drive
 * proposals; heldout tasks evaluate the FINAL library with one fresh
 * attempt each, after all dev tasks are terminal.
 *
 * @module skill/coordinator
 */

import { Effect } from "effect"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { spawnSubagent, type SpawnOpts, type SubagentResult } from "../subagent/spawn"
import {
  SkillLibrary,
  SkillLibraryLive,
  getSkillsDir,
  getSkillCampaignsDir,
  librarySha,
} from "./store"
import { validateSkillReport } from "./report"
import { lintProposalFile } from "./lint"
import { runVerification, assertCheckAllowed } from "./verifier"
import { stageWorkerPrompt, buildWorkerArgv } from "./dispatch"
import type { CampaignManifest, SkillTask } from "./schema"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Contents of campaign.json — the campaign's static definition. */
export interface CampaignState {
  schemaVersion: 1
  /** Absolute path of the campaign directory. */
  dir: string
  name: string
  createdAt: string
  tasks: SkillTask[]
  bands: { dev: string[]; heldout: string[] }
}

/** One line of campaign progress for the CLI to print. */
export type CampaignEvent =
  | { kind: "task-start"; taskId: string }
  | { kind: "task-report-invalid"; taskId: string; errors: string[] }
  | { kind: "task-proposals"; taskId: string; staged: number; lintFailures: number }
  | { kind: "task-verified"; taskId: string; verdict: string }
  | { kind: "library-updated"; librarySha: string }
  | { kind: "heldout-result"; taskId: string; pass: boolean }
  | { kind: "campaign-done"; manifest: CampaignManifest }

/** Injectable child-process runner (tests substitute a fake). */
export type SpawnRunner = (task: string, opts: SpawnOpts) => Promise<SubagentResult>

/** A task whose worker report is missing/invalid is retried this many times. */
const MAX_REPORT_RETRIES = 2

const DIM = "\x1b[2m"
const RESET = "\x1b[0m"

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf-8")
  fs.renameSync(tmp, file)
}

function readJson(file: string): unknown | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, "utf-8"))
  } catch {
    return null
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  return slug || "run"
}

function runLib<T>(use: (lib: SkillLibrary) => Effect.Effect<T, Error>): Promise<T> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const lib = yield* SkillLibrary
      return yield* use(lib)
    }).pipe(Effect.provide(SkillLibraryLive)),
  )
}

// ---------------------------------------------------------------------------
// Task-set validation (audit_seeding.py disjointness port)
// ---------------------------------------------------------------------------

/**
 * Validate a tasks JSON file: array of SkillTask with unique ids,
 * non-empty prompts, whitelisted check commands, and a valid band split
 * (≥1 dev, ≥1 heldout, no overlap between bands).
 */
export function parseTasksFile(raw: unknown): SkillTask[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("tasks file must be a non-empty JSON array of SkillTask")
  }
  const tasks: SkillTask[] = []
  const seen = new Set<string>()
  const errors: string[] = []
  raw.forEach((t, i) => {
    const where = `tasks[${i}]`
    if (!isRecord(t)) {
      errors.push(`${where}: not an object`)
      return
    }
    const id = nonEmpty(t.id) ? String(t.id).trim() : ""
    if (!id) {
      errors.push(`${where}: id is empty`)
    } else if (seen.has(id)) {
      errors.push(`${where}: duplicate task id '${id}'`)
    }
    seen.add(id)
    if (!nonEmpty(t.prompt)) errors.push(`${where} (${id || "?"}): prompt is empty`)
    if (!nonEmpty(t.check)) {
      errors.push(`${where} (${id || "?"}): check is empty`)
    } else {
      try {
        assertCheckAllowed(String(t.check))
      } catch (err) {
        errors.push(`${where} (${id || "?"}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (t.band !== "dev" && t.band !== "heldout") {
      errors.push(`${where} (${id || "?"}): band must be "dev" or "heldout"`)
    }
    if (id && nonEmpty(t.prompt) && nonEmpty(t.check) && (t.band === "dev" || t.band === "heldout")) {
      tasks.push({ id, prompt: String(t.prompt), check: String(t.check), band: t.band })
    }
  })
  if (errors.length > 0) {
    throw new Error(`invalid tasks file:\n  ${errors.join("\n  ")}`)
  }

  const dev = tasks.filter((t) => t.band === "dev")
  const heldout = tasks.filter((t) => t.band === "heldout")
  if (dev.length === 0) throw new Error("tasks file needs at least one dev-band task")
  if (heldout.length === 0) {
    throw new Error("tasks file needs at least one heldout-band task")
  }
  const overlap = dev.filter((d) => heldout.some((h) => h.id === d.id))
  if (overlap.length > 0) {
    throw new Error(`dev/heldout bands overlap on task id(s): ${overlap.map((t) => t.id).join(", ")}`)
  }
  return tasks
}

// ---------------------------------------------------------------------------
// Identity hashing (run_validation.py:98-126 port)
// ---------------------------------------------------------------------------

/** sha256 of the canonical tasks JSON, 16 hex chars. */
export function computeTaskSetSha(tasks: SkillTask[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(tasks)).digest("hex").slice(0, 16)
}

/** runId = sha256(JSON.stringify(identity))[:16] — key order is part of the identity. */
export function computeRunId(identity: CampaignManifest["identity"]): string {
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16)
}

function buildManifest(tasks: SkillTask[]): CampaignManifest {
  const identity = {
    librarySha: librarySha(getSkillsDir()),
    taskSetSha: computeTaskSetSha(tasks),
    model: process.env.MOMO_MODEL || "default",
  }
  const manifest: CampaignManifest = {
    schemaVersion: 1,
    runId: computeRunId(identity),
    identity,
    tasks: {},
  }
  for (const t of tasks) manifest.tasks[t.id] = { status: "pending", passes: 0, trials: 0 }
  return manifest
}

// ---------------------------------------------------------------------------
// Campaign lifecycle: init / load / status
// ---------------------------------------------------------------------------

/**
 * Create `<momoHome>/skill-campaigns/<stamp>_<name>/` with campaign.json
 * (static definition incl. band split) and manifest.json (identity-hashed,
 * every task pending). Returns the campaign state.
 */
export function initCampaign(opts: { tasksFile: string; name?: string }): CampaignState {
  const raw = readJson(opts.tasksFile)
  if (raw === null) throw new Error(`cannot read tasks file: ${opts.tasksFile}`)
  const tasks = parseTasksFile(raw)

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const dir = path.join(getSkillCampaignsDir(), `${stamp}_${slugify(opts.name ?? "run")}`)
  fs.mkdirSync(path.join(dir, "tasks"), { recursive: true })

  const state: CampaignState = {
    schemaVersion: 1,
    dir,
    name: opts.name ?? "run",
    createdAt: new Date().toISOString(),
    tasks,
    bands: {
      dev: tasks.filter((t) => t.band === "dev").map((t) => t.id),
      heldout: tasks.filter((t) => t.band === "heldout").map((t) => t.id),
    },
  }
  atomicWriteJson(path.join(dir, "campaign.json"), state)
  atomicWriteJson(path.join(dir, "manifest.json"), buildManifest(tasks))
  return state
}

/** Load campaign.json from a campaign directory. */
export function loadCampaign(dir: string): CampaignState {
  const raw = readJson(path.join(dir, "campaign.json"))
  if (!isRecord(raw)) throw new Error(`not a campaign directory: ${dir}`)
  return raw as unknown as CampaignState
}

/** Load manifest.json from a campaign directory. */
export function loadManifest(dir: string): CampaignManifest {
  const raw = readJson(path.join(dir, "manifest.json"))
  if (!isRecord(raw)) throw new Error(`no manifest in campaign directory: ${dir}`)
  return raw as unknown as CampaignManifest
}

/** Campaign definition + current manifest. */
export function campaignStatus(dir: string): { state: CampaignState; manifest: CampaignManifest } {
  return { state: loadCampaign(dir), manifest: loadManifest(dir) }
}

function writeManifest(dir: string, manifest: CampaignManifest): void {
  atomicWriteJson(path.join(dir, "manifest.json"), manifest)
}

// ---------------------------------------------------------------------------
// Default event printer
// ---------------------------------------------------------------------------

/** One-line DIM summaries; the CLI substitutes a prettier printer. */
export function printCampaignEvent(event: CampaignEvent): void {
  switch (event.kind) {
    case "task-start":
      console.log(`${DIM}[aspire] task ${event.taskId} → worker dispatched${RESET}`)
      break
    case "task-report-invalid":
      console.log(
        `${DIM}[aspire] task ${event.taskId}: invalid report (${event.errors.length} problem(s))${RESET}`,
      )
      break
    case "task-proposals":
      console.log(
        `${DIM}[aspire] task ${event.taskId}: ${event.staged} proposal(s) staged, ${event.lintFailures} lint failure(s)${RESET}`,
      )
      break
    case "task-verified":
      console.log(`${DIM}[aspire] task ${event.taskId}: verification → ${event.verdict}${RESET}`)
      break
    case "library-updated":
      console.log(`${DIM}[aspire] library updated → sha ${event.librarySha}${RESET}`)
      break
    case "heldout-result":
      console.log(`${DIM}[aspire] heldout ${event.taskId}: ${event.pass ? "PASS" : "FAIL"}${RESET}`)
      break
    case "campaign-done": {
      const t = Object.values(event.manifest.tasks)
      const done = t.filter((x) => x.status === "done").length
      const failed = t.filter((x) => x.status === "failed").length
      console.log(
        `${DIM}[aspire] campaign ${event.manifest.runId} done: ${done} done, ${failed} failed${RESET}`,
      )
      break
    }
  }
}

// ---------------------------------------------------------------------------
// runCampaign
// ---------------------------------------------------------------------------

export interface RunCampaignOpts {
  campaignDir: string
  concurrency?: number
  onEvent?: (event: CampaignEvent) => void
  /** Injectable child-process runner (default: the real spawnSubagent). */
  spawnRunner?: SpawnRunner
}

/**
 * Run a campaign to completion (synchronous batch loop):
 *
 * 1. Dev loop — pick up to `concurrency` pending dev tasks, stage worker
 *    prompt packages, spawn one subagent each, await all. For each finished
 *    task: a missing/invalid skill_report.json sends the task back to
 *    pending with a retry counter (2 retries, then failed); a valid report
 *    is graded, staged, lint-gated, and each lint-clean proposal goes
 *    through the transmission test; verified proposals are applied to the
 *    library (the only write path).
 * 2. Heldout sweep — once every dev task is done or failed, each heldout
 *    task gets ONE fresh attempt against the final library (content
 *    inlined in its prompt) and records pass/fail in heldout_outcome.json.
 *
 * The manifest is rewritten atomically after every batch; the final
 * manifest is returned.
 */
export async function runCampaign(opts: RunCampaignOpts): Promise<CampaignManifest> {
  const state = loadCampaign(opts.campaignDir)
  const manifest = loadManifest(opts.campaignDir)
  const emit = opts.onEvent ?? printCampaignEvent
  const run: SpawnRunner = opts.spawnRunner ?? spawnSubagent
  const concurrency =
    opts.concurrency ?? (Number(process.env.MOMO_ASPIRE_CONCURRENCY || 2) || 2)
  const taskTimeoutMs =
    Number(process.env.MOMO_ASPIRE_TASK_TIMEOUT_MS || 900_000) || 900_000

  const devTasks = state.bands.dev
    .map((id) => state.tasks.find((t) => t.id === id))
    .filter((t): t is SkillTask => !!t)
  const heldoutTasks = state.bands.heldout
    .map((id) => state.tasks.find((t) => t.id === id))
    .filter((t): t is SkillTask => !!t)

  const markInvalid = (task: SkillTask, errors: string[]): void => {
    const entry = manifest.tasks[task.id]
    const retries = (entry.retries ?? 0) + 1
    entry.retries = retries
    entry.status = retries > MAX_REPORT_RETRIES ? "failed" : "pending"
    emit({ kind: "task-report-invalid", taskId: task.id, errors })
  }

  const processDevTask = async (task: SkillTask): Promise<void> => {
    const taskDir = path.join(opts.campaignDir, "tasks", task.id)
    const entry = manifest.tasks[task.id]
    try {
      const raw = readJson(path.join(taskDir, "skill_report.json"))
      const validation = raw
        ? validateSkillReport(raw)
        : ({ ok: false as const, errors: ["skill_report.json is missing"] })
      if (!validation.ok) {
        markInvalid(task, validation.errors)
        return
      }
      entry.status = "done"

      // 1. record consulted grades
      await runLib((lib) => lib.recordGrades(validation.report))

      // 2. stage proposals into the campaign dir (never the library)
      const proposalDir = path.join(opts.campaignDir, "proposals", task.id)
      const staged = await runLib((lib) => lib.stageProposal(validation.report, proposalDir))

      // 3. lint-gate each staged proposal against the library
      let lintFailures = 0
      const clean: string[] = []
      for (const file of staged.proposalFiles) {
        const result = lintProposalFile(file, getSkillsDir())
        if (result.errors.length > 0) {
          lintFailures++
        } else {
          clean.push(file)
        }
      }
      emit({ kind: "task-proposals", taskId: task.id, staged: staged.proposalFiles.length, lintFailures })

      // 4. transmission test per surviving proposal; verified → apply
      for (const file of clean) {
        const outDir = path.join(
          opts.campaignDir,
          "verify",
          task.id,
          path.basename(file, ".md"),
        )
        const vReport = await runVerification({
          task,
          proposalFile: file,
          libraryDir: getSkillsDir(),
          outDir,
          taskDir,
          spawn: run,
        })
        entry.trials += vReport.trials
        emit({ kind: "task-verified", taskId: task.id, verdict: vReport.verdict })
        if (vReport.verdict === "verified") {
          entry.passes += vReport.passes
          const shaBefore = await runLib((lib) => lib.sha())
          await runLib((lib) => lib.applyVerified(vReport, file))
          const shaAfter = await runLib((lib) => lib.sha())
          if (shaBefore !== shaAfter) {
            emit({ kind: "library-updated", librarySha: shaAfter })
          }
        }
      }
    } catch (err) {
      markInvalid(task, [err instanceof Error ? err.message : String(err)])
    }
  }

  // ---- dev loop -------------------------------------------------------------
  for (;;) {
    const pending = devTasks.filter((t) => manifest.tasks[t.id].status === "pending")
    if (pending.length === 0) break
    const batch = pending.slice(0, concurrency)
    const libraryShaNow = await runLib((lib) => lib.sha())

    for (const task of batch) manifest.tasks[task.id].status = "running"
    writeManifest(opts.campaignDir, manifest)

    await Promise.all(
      batch.map(async (task) => {
        emit({ kind: "task-start", taskId: task.id })
        const promptFile = stageWorkerPrompt({
          campaignDir: opts.campaignDir,
          task,
          librarySha: libraryShaNow,
        })
        await run(`task ${task.id} (band ${task.band})`, {
          args: buildWorkerArgv(promptFile),
          timeoutMs: taskTimeoutMs,
        })
      }),
    )

    // gate + apply sequentially: the library is shared mutable state
    for (const task of batch) await processDevTask(task)
    writeManifest(opts.campaignDir, manifest)
  }

  // ---- heldout sweep ----------------------------------------------------------
  const libraryShaFinal = await runLib((lib) => lib.sha())
  for (let i = 0; i < heldoutTasks.length; i += concurrency) {
    const chunk = heldoutTasks.slice(i, i + concurrency)
    await Promise.all(
      chunk.map(async (task) => {
        const taskDir = path.join(opts.campaignDir, "tasks", task.id)
        const promptFile = stageWorkerPrompt({
          campaignDir: opts.campaignDir,
          task,
          librarySha: libraryShaFinal,
          role: "heldout",
        })
        const result = await run(`heldout ${task.id}`, {
          args: buildWorkerArgv(promptFile, "heldout_outcome.json"),
          timeoutMs: taskTimeoutMs,
        })
        const outcome = readJson(path.join(taskDir, "heldout_outcome.json"))
        const pass =
          isRecord(outcome) && typeof outcome.pass === "boolean"
            ? outcome.pass
            : result.exitCode === 0
        manifest.tasks[task.id] = { status: "done", passes: pass ? 1 : 0, trials: 1 }
        emit({ kind: "heldout-result", taskId: task.id, pass })
      }),
    )
    writeManifest(opts.campaignDir, manifest)
  }

  emit({ kind: "campaign-done", manifest })
  return manifest
}
