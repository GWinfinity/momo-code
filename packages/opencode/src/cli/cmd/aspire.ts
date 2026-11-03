/**
 * /aspire command — ASPIRE-style agentic skill discovery (Phase 1).
 *
 * Ports the core loop of NVIDIA's ASPIRE: a lintable skill library is the
 * only trusted cross-task channel, and a transmission test (a fresh agent
 * re-solving a task from skill text alone) gates every promotion into it.
 *
 * Sub-commands:
 *   momo /aspire init [--project]            Create the skills/ skeleton (+example)
 *   momo /aspire status [--json]             Library stats + content hash + ledger size
 *   momo /aspire lint [file|--proposal f]    Lint the library or one proposal
 *   momo /aspire verify <proposal> <task>    Transmission test (fresh subagent)
 *   momo /aspire apply <report.json> [--proposal f] [--tactic]
 *                                            Apply a verified report into the library
 *   momo /aspire grade <report.json>         Record consulted-entry grades in the ledger
 */
import { Effect } from "effect"
import * as fs from "fs"
import * as path from "path"
import { SkillLibrary, SkillLibraryLive, getSkillsDir, getSkillCampaignsDir, parseSkillFile } from "../../skill/store.js"
import { lintLibrary, lintProposalFile } from "../../skill/lint.js"
import { validateSkillReport } from "../../skill/report.js"
import { runVerification, assertCheckAllowed } from "../../skill/verifier.js"
import {
  initCampaign,
  runCampaign,
  campaignStatus,
  printCampaignEvent,
  type CampaignEvent,
} from "../../skill/coordinator.js"
import {
  initEvosearch,
  runEvosearch,
  loadEvoState,
  printEvoEvent,
  type EvoEvent,
} from "../../skill/evosearch.js"
import type { SkillEntry, SkillTask, VerificationReport } from "../../skill/schema.js"
import { generateTacticId, type Tactic } from "../../experience/tactic.js"
import { ExperienceStore, ExperienceStoreLive } from "../../experience/store.js"

const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const MAGENTA = "\x1b[95m"

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`${MAGENTA}momo /aspire${RESET} — ASPIRE-style skill discovery (library + transmission-test gate)`)
  console.log(``)
  console.log(`Usage:`)
  console.log(`  momo /aspire init [--project]          Create the skills/ skeleton (+ example entry)`)
  console.log(`  momo /aspire status [--json]           Library stats + librarySha + ledger size`)
  console.log(`  momo /aspire lint [file]               Lint the library (or one file)`)
  console.log(`  momo /aspire lint --proposal <file>    Lint a staged proposal against the library`)
  console.log(`  momo /aspire verify <proposal> <task>  Transmission test: fresh agent, text only [--trials=N]`)
  console.log(`  momo /aspire apply <report.json>       Apply a verified report [--proposal f] [--tactic]`)
  console.log(`  momo /aspire grade <report.json>       Record consulted-entry grades in the ledger`)
  console.log(`  momo /aspire campaign init <tasks.json> [--name=S]`)
  console.log(`                                         Create a campaign (≥1 dev + ≥1 heldout task)`)
  console.log(`  momo /aspire campaign run [dir] [--concurrency=N]`)
  console.log(`                                         Run the campaign (workers → gate → library)`)
  console.log(`  momo /aspire campaign status [dir] [--json]`)
  console.log(`                                         Manifest + per-task table`)
  console.log(`  sim tasks: check = python -m sim_eval --task <name> --seed <N> --program {task_dir}/program.py`)
  console.log(`                                         ({task_dir} expands to the task's campaign dir in agent prompts)`)
  console.log(`  momo /aspire evosearch init <task.json> [--k=N] [--out=dir]`)
  console.log(`                                         Start evolutionary search over strategies`)
  console.log(`  momo /aspire evosearch run [dir] [--max-iterations=N] [--threshold=T]`)
  console.log(`                                         Run the search (author → evaluate → select)`)
  console.log(`  momo /aspire evosearch status [dir] [--json]`)
  console.log(`                                         Iterations, leaderboards, eliminated ledger`)
  console.log(``)
  console.log(`The library at ${DIM}~/.momo/skills/${RESET} is only written by 'apply', and only`)
  console.log(`for reports whose verdict is 'verified'.`)
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

interface Flags {
  json: boolean
  project: boolean
  tactic: boolean
  proposal?: string
  trials?: number
  name?: string
  concurrency?: number
  k?: number
  out?: string
  maxIterations?: number
  threshold?: number
  help: boolean
  positional: string[]
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    json: false,
    project: false,
    tactic: false,
    help: false,
    positional: [],
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--json") flags.json = true
    else if (a === "--project") flags.project = true
    else if (a === "--tactic") flags.tactic = true
    else if (a === "--help" || a === "-h") flags.help = true
    else if (a === "--proposal") flags.proposal = args[++i]
    else if (a.startsWith("--proposal=")) flags.proposal = a.slice("--proposal=".length)
    else if (a === "--trials") flags.trials = Number(args[++i]) || 1
    else if (a.startsWith("--trials=")) flags.trials = Number(a.slice("--trials=".length)) || 1
    else if (a === "--name") flags.name = args[++i]
    else if (a.startsWith("--name=")) flags.name = a.slice("--name=".length)
    else if (a === "--concurrency") flags.concurrency = Number(args[++i]) || undefined
    else if (a.startsWith("--concurrency=")) flags.concurrency = Number(a.slice("--concurrency=".length)) || undefined
    else if (a === "--k") flags.k = Number(args[++i]) || undefined
    else if (a.startsWith("--k=")) flags.k = Number(a.slice("--k=".length)) || undefined
    else if (a === "--out") flags.out = args[++i]
    else if (a.startsWith("--out=")) flags.out = a.slice("--out=".length)
    else if (a === "--max-iterations") flags.maxIterations = Number(args[++i]) || undefined
    else if (a.startsWith("--max-iterations=")) flags.maxIterations = Number(a.slice("--max-iterations=".length)) || undefined
    else if (a === "--threshold") flags.threshold = Number(args[++i]) || undefined
    else if (a.startsWith("--threshold=")) flags.threshold = Number(a.slice("--threshold=".length)) || undefined
    else flags.positional.push(a)
  }
  return flags
}

async function withLibrary<T>(
  use: (lib: SkillLibrary) => Effect.Effect<T, Error>,
): Promise<T> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const lib = yield* SkillLibrary
      return yield* use(lib)
    }).pipe(Effect.provide(SkillLibraryLive)),
  )
}

function readJsonFile<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

const EXAMPLE_SKILL = `---
name: example
description: Worked example of a skill entry — copy its shape, then delete this file.
---

## Example

### Clamp a number to a range

**Trigger**: You need to bound a number to [low, high] and the project has no clamp helper.

\`\`\`ts
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
\`\`\`

**Evidence**: Verified by the /aspire transmission test on the "clamp" example task (3/3 passes).
`

const README = `# momo skill library

The only trusted cross-task channel in the ASPIRE loop. Workers propose,
an independent verifier re-solves the task from this text alone, and only
verified proposals are written here (by \`momo /aspire apply\`).

## File format

YAML-ish frontmatter (name, description) + \`## Section\` headings + entries:

\`\`\`markdown
### Entry title

**Trigger**: when to reach for this — the situation, not the solution.

\`\`\`ts
// code a reader can paste; must parse; helpers must be defined in the file
\`\`\`

**Evidence**: how this was verified (task, passes, date).
\`\`\`

Rules enforced by \`momo /aspire lint\`:
- every fenced snippet must parse as TypeScript;
- every identifier used must be a builtin, or defined in a fence of the library;
- \`other.md §Section\` references must resolve to a real heading;
- warnings: search loops seeded with a default (no empty case), and
  \`Math.min/max(...xs)\` with no emptiness guard.

## Lifecycle

1. A worker stages proposals into a campaign dir (\`proposed/<slug>.md\`).
2. \`momo /aspire lint --proposal <file>\` checks them against this library.
3. \`momo /aspire verify <proposal> <task.json>\` runs the transmission test.
4. \`momo /aspire apply <verification_report.json> --proposal <dir>\` writes
   verified entries in place (REPLACE-NOT-ANNOTATE); the old text moves to
   \`changelog/<skill>.md\`.

\`README.md\` and \`changelog/\` are excluded from the library content hash:
docs edits and history must not change the library's identity.
`

async function runInit(flags: Flags): Promise<void> {
  const base = flags.project ? path.join(process.cwd(), ".momo", "skills") : getSkillsDir()
  fs.mkdirSync(base, { recursive: true })
  let created = 0
  for (const [name, content] of [
    ["README.md", README],
    ["example.md", EXAMPLE_SKILL],
  ] as const) {
    const file = path.join(base, name)
    if (fs.existsSync(file)) {
      console.log(`${DIM}exists${RESET}  ${file}`)
      continue
    }
    fs.writeFileSync(file, content, "utf-8")
    created++
    console.log(`${GREEN}✓${RESET} created ${CYAN}${file}${RESET}`)
  }
  console.log(
    created > 0
      ? `${GREEN}✓${RESET} skill library skeleton ready — try: ${DIM}momo /aspire status${RESET}`
      : `${DIM}skill library already initialized at ${base}${RESET}`,
  )
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function runStatus(flags: Flags): Promise<void> {
  const dir = getSkillsDir()
  const result = await withLibrary((lib) =>
    Effect.gen(function* () {
      const skills = yield* lib.list()
      const sha = yield* lib.sha()
      const ledger = yield* lib.ledgerSize()
      return { skills, sha, ledger }
    }),
  )

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").sort()
    : []
  const details = files.map((f) => ({
    name: path.basename(f, ".md"),
    entries: parseSkillFile(fs.readFileSync(path.join(dir, f), "utf-8")).entries.length,
  }))

  if (flags.json) {
    console.log(
      JSON.stringify(
        { libraryDir: dir, librarySha: result.sha, skills: details, ledgerLines: result.ledger },
        null,
        2,
      ),
    )
    return
  }

  console.log(`${MAGENTA}Skill library${RESET} ${DIM}(${dir})${RESET}`)
  console.log(`  librarySha:  ${CYAN}${result.sha}${RESET}`)
  console.log(`  skills:      ${result.skills.length ? result.skills.join(", ") : "(none — run: momo /aspire init)"}`)
  for (const d of details) console.log(`    ${DIM}-${RESET} ${d.name}: ${d.entries} entr${d.entries === 1 ? "y" : "ies"}`)
  console.log(`  ledger:      ${result.ledger} grade record(s)`)
}

// ---------------------------------------------------------------------------
// lint
// ---------------------------------------------------------------------------

function printLintResult(result: { errors: Array<{ file: string; line?: number; check: string; message: string }>; warnings: Array<{ file: string; line?: number; check: string; message: string }> }): void {
  for (const e of result.errors) {
    console.log(`  ${RED}✗ [${e.check}]${RESET} ${e.file}${e.line ? `:${e.line}` : ""} — ${e.message}`)
  }
  for (const w of result.warnings) {
    console.log(`  ${YELLOW}⚠ [${w.check}]${RESET} ${w.file}${w.line ? `:${w.line}` : ""} — ${w.message}`)
  }
  console.log(
    result.errors.length + result.warnings.length === 0
      ? `  ${GREEN}✓ clean${RESET} ${DIM}(0 errors, 0 warnings)${RESET}`
      : `  ${DIM}${result.errors.length} error(s), ${result.warnings.length} warning(s)${RESET}`,
  )
}

async function runLint(flags: Flags): Promise<void> {
  const target = flags.proposal ?? flags.positional[0]
  if (target && !fs.existsSync(target)) {
    console.error(`✗ not found: ${target}`)
    process.exit(1)
  }
  let result
  if (flags.proposal) {
    result = lintProposalFile(flags.proposal, getSkillsDir())
  } else if (target) {
    result = fs.statSync(target).isDirectory()
      ? lintLibrary(target)
      : lintProposalFile(target, getSkillsDir())
  } else {
    result = lintLibrary(getSkillsDir())
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    printLintResult(result)
  }
  if (result.errors.length > 0) process.exit(1)
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

function isSkillTask(raw: unknown): raw is SkillTask {
  const t = raw as SkillTask
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.prompt === "string" &&
    typeof t.check === "string" &&
    (t.band === "dev" || t.band === "heldout")
  )
}

async function runVerify(flags: Flags): Promise<void> {
  const proposalFile = flags.positional[0]
  const taskFile = flags.positional[1]
  if (!proposalFile || !taskFile) {
    console.error(`Usage: momo /aspire verify <proposal> <task.json> [--trials=N]`)
    process.exit(1)
  }
  let task: SkillTask
  try {
    task = readJsonFile<SkillTask>(taskFile)
  } catch (err) {
    console.error(`✗ cannot read task JSON: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  if (!isSkillTask(task)) {
    console.error(`✗ task JSON must be {id, prompt, check, band: "dev"|"heldout"}`)
    process.exit(1)
  }
  try {
    assertCheckAllowed(task.check)
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  if (!fs.existsSync(proposalFile)) {
    console.error(`✗ proposal not found: ${proposalFile}`)
    process.exit(1)
  }

  const outDir = path.join(getSkillCampaignsDir(), `manual-${Date.now()}`)
  console.log(`${DIM}→ transmission test: task ${task.id}, ${flags.trials ?? 1} trial(s)${RESET}`)
  console.log(`${DIM}  outDir: ${outDir}${RESET}`)

  const report = await runVerification({
    task,
    proposalFile,
    libraryDir: getSkillsDir(),
    trials: flags.trials ?? 1,
    outDir,
  })

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const color = report.verdict === "verified" ? GREEN : report.verdict === "refuted" ? RED : YELLOW
  console.log(`${color}verdict: ${report.verdict}${RESET} (${report.passes}/${report.trials} passed)`)
  console.log(`  ${DIM}${report.notes}${RESET}`)
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

/** Adapted from refine/apply.ts buildTactic: a verified skill entry becomes
 *  a draft KEP tactic so the experience injector picks it up immediately. */
function buildTacticFromEntry(entry: SkillEntry): Tactic | null {
  const steps = [entry.code.trim(), entry.trigger.trim()].filter((s) => s.length > 0)
  if (steps.length === 0) return null
  const now = new Date().toISOString()
  return {
    id: generateTacticId("global", entry.title),
    scope: "global",
    intent: "workflow",
    title: entry.title,
    // Synthetic session-start signal, same as refine/apply.ts, so the draft
    // is always eligible for Thompson-ranked selection.
    triggers: [{ types: ["test-pass"], minConfidence: 0.5 }],
    preconditions: entry.trigger.trim()
      ? [entry.trigger.trim()]
      : ["Applicable to current task context"],
    steps,
    guardrails: {
      maxFiles: 5,
      forbiddenPaths: [".git", "node_modules"],
      smallestReversible: true,
    },
    checks: [],
    stats: { wins: 0, losses: 0, alpha: 1, beta: 1, lastUsed: now, uses: 0 },
    status: "draft",
    provenance: { fromSessions: [], createdAt: now, scrubbed: true },
  }
}

async function runApply(flags: Flags): Promise<void> {
  const reportFile = flags.positional[0]
  if (!reportFile) {
    console.error(`Usage: momo /aspire apply <verificationReport.json> --proposal <fileOrDir> [--tactic]`)
    process.exit(1)
  }
  let report: VerificationReport
  try {
    report = readJsonFile<VerificationReport>(reportFile)
  } catch (err) {
    console.error(`✗ cannot read verification report: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  if (report.verdict !== "verified") {
    console.error(`✗ report verdict is '${report.verdict}' — only verified reports may be applied`)
    process.exit(1)
  }
  if (!flags.proposal) {
    console.error(`✗ --proposal <fileOrDir> is required (the staged package the report verified)`)
    process.exit(1)
  }
  if (!fs.existsSync(flags.proposal)) {
    console.error(`✗ proposal path not found: ${flags.proposal}`)
    process.exit(1)
  }

  // Collect entries up front so --tactic can map them back to what applied.
  const appliedKeys = new Set<string>()
  const outcome = await withLibrary((lib) => lib.applyVerified(report, flags.proposal!))
  for (const a of outcome.applied) appliedKeys.add(a)

  for (const a of outcome.applied) console.log(`${GREEN}✓ applied${RESET} ${CYAN}${a}${RESET}`)
  for (const s of outcome.skipped) console.log(`${DIM}- skipped${RESET} ${s}`)
  for (const p of outcome.patched) console.log(`${YELLOW}⚑ recorded edit${RESET} ${p} ${DIM}(changelog)${RESET}`)
  if (outcome.applied.length === 0 && outcome.patched.length === 0) {
    console.log(`${DIM}nothing to apply${RESET}`)
  }

  if (flags.tactic && outcome.applied.length > 0) {
    const entries: SkillEntry[] = []
    const proposalStat = fs.statSync(flags.proposal!)
    const proposalPaths = proposalStat.isFile()
      ? [flags.proposal!]
      : collectProposalFiles(flags.proposal!)
    for (const file of proposalPaths) {
      const parsed = parseSkillFile(fs.readFileSync(file, "utf-8"), path.basename(file, ".md"))
      for (const entry of parsed.entries) {
        if (appliedKeys.has(`${entry.skill} §${entry.title}`)) entries.push(entry)
      }
    }
    const tacticIds: string[] = []
    for (const entry of entries) {
      const tactic = buildTacticFromEntry(entry)
      if (!tactic) continue
      const added = await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* ExperienceStore
          const existing = yield* store.loadTactics()
          if (existing.some((t) => t.id === tactic.id || t.title === tactic.title)) return false
          yield* store.saveTactics([...existing, tactic])
          yield* store.appendLedger({
            kind: "distill",
            tacticIds: [tactic.id],
            summary: `/aspire promoted skill entry ${entry.skill} §${entry.title} to draft tactic`,
            timestamp: new Date().toISOString(),
          })
          return true
        }).pipe(Effect.provide(ExperienceStoreLive)),
      )
      if (added) tacticIds.push(tactic.id)
      else console.log(`${DIM}- tactic exists for '${tactic.title}' — skipped${RESET}`)
    }
    for (const id of tacticIds) {
      console.log(`${GREEN}✓ tactic${RESET} ${CYAN}${id}${RESET} ${DIM}(draft)${RESET}`)
    }
  }

  const sha = await withLibrary((lib) => lib.sha())
  console.log(`${DIM}librarySha is now ${sha}${RESET}`)
}

/** Mirror of store.resolveProposalFiles for collecting applied entries. */
function collectProposalFiles(dir: string): string[] {
  const proposed = path.join(dir, "proposed")
  const target = fs.existsSync(proposed) ? proposed : dir
  return fs
    .readdirSync(target)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((f) => path.join(target, f))
}

// ---------------------------------------------------------------------------
// grade
// ---------------------------------------------------------------------------

async function runGrade(flags: Flags): Promise<void> {
  const reportFile = flags.positional[0]
  if (!reportFile) {
    console.error(`Usage: momo /aspire grade <skillReport.json>`)
    process.exit(1)
  }
  let raw: unknown
  try {
    raw = readJsonFile<unknown>(reportFile)
  } catch (err) {
    console.error(`✗ cannot read skill report: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  const result = validateSkillReport(raw)
  if (!result.ok) {
    for (const e of result.errors) console.error(`✗ ${e}`)
    process.exit(1)
  }
  const n = await withLibrary((lib) => lib.recordGrades(result.report))
  console.log(`${GREEN}✓${RESET} recorded ${CYAN}${n}${RESET} grade(s) in skills/ledger.jsonl`)
  for (const c of result.report.consulted) {
    const color = c.verdict === "useful" ? GREEN : c.verdict === "not-applicable" ? DIM : YELLOW
    console.log(`  ${color}${c.verdict}${RESET} ${c.skill} §${c.section}`)
  }
}

// ---------------------------------------------------------------------------
// campaign
// ---------------------------------------------------------------------------

/** Resolve the most recently modified campaign dir, or null when none. */
function latestCampaignDir(): string | null {
  const root = getSkillCampaignsDir()
  try {
    if (!fs.existsSync(root)) return null
    let best: { dir: string; mtime: number } | null = null
    for (const f of fs.readdirSync(root)) {
      const dir = path.join(root, f)
      try {
        if (!fs.statSync(dir).isDirectory()) continue
        const mtime = fs.statSync(dir).mtimeMs
        if (!best || mtime > best.mtime) best = { dir, mtime }
      } catch {
        /* skip unreadable entries */
      }
    }
    return best?.dir ?? null
  } catch {
    return null
  }
}

function campaignEventPrinter(event: CampaignEvent): void {
  switch (event.kind) {
    case "task-start":
      console.log(`${CYAN}▶${RESET} task ${event.taskId} ${DIM}→ worker dispatched${RESET}`)
      break
    case "task-report-invalid":
      console.log(
        `${YELLOW}✗${RESET} task ${event.taskId}: invalid report — ${event.errors[0] ?? "unknown"}`,
      )
      break
    case "task-proposals":
      console.log(
        `${CYAN}◆${RESET} task ${event.taskId}: ${event.staged} proposal(s) staged, ${event.lintFailures} lint failure(s)`,
      )
      break
    case "task-verified":
      console.log(
        `${event.verdict === "verified" ? GREEN : YELLOW}✓${RESET} task ${event.taskId}: verification → ${event.verdict}`,
      )
      break
    case "library-updated":
      console.log(`${GREEN}✚${RESET} library updated ${DIM}→ sha ${event.librarySha}${RESET}`)
      break
    case "heldout-result":
      console.log(
        `${event.pass ? GREEN : RED}●${RESET} heldout ${event.taskId}: ${event.pass ? "PASS" : "FAIL"}`,
      )
      break
    case "campaign-done": {
      const t = Object.values(event.manifest.tasks)
      const done = t.filter((x) => x.status === "done").length
      const failed = t.filter((x) => x.status === "failed").length
      console.log(
        `${GREEN}✓${RESET} campaign ${CYAN}${event.manifest.runId}${RESET} ${DIM}done: ${done} done, ${failed} failed${RESET}`,
      )
      break
    }
    default:
      printCampaignEvent(event)
  }
}

async function runCampaignInit(flags: Flags): Promise<void> {
  const tasksFile = flags.positional[0]
  if (!tasksFile) {
    console.error(`Usage: momo /aspire campaign init <tasks.json> [--name=S]`)
    process.exit(1)
  }
  let state
  try {
    state = initCampaign({ tasksFile, name: flags.name })
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  const { manifest } = campaignStatus(state.dir)
  console.log(`${GREEN}✓${RESET} campaign initialized at ${CYAN}${state.dir}${RESET}`)
  console.log(`  runId:   ${manifest.runId}`)
  console.log(`  dev:     ${state.bands.dev.length} task(s): ${state.bands.dev.join(", ")}`)
  console.log(`  heldout: ${state.bands.heldout.length} task(s): ${state.bands.heldout.join(", ")}`)
  if (state.tasks.some((t) => t.check.includes("sim_eval"))) {
    console.log(
      `${DIM}  sim_eval task(s) detected — '{task_dir}' in a check expands to <campaignDir>/tasks/<taskId> when staged for agents${RESET}`,
    )
  }
  console.log(`${DIM}Run it with: momo /aspire campaign run ${state.dir}${RESET}`)
}

async function runCampaignRun(flags: Flags): Promise<void> {
  const campaignDir = flags.positional[0] ?? latestCampaignDir()
  if (!campaignDir) {
    console.error(`✗ no campaign found under ${getSkillCampaignsDir()} — run 'campaign init' first`)
    process.exit(1)
  }
  if (!fs.existsSync(path.join(campaignDir, "campaign.json"))) {
    console.error(`✗ not a campaign directory: ${campaignDir}`)
    process.exit(1)
  }
  console.log(`${DIM}→ running campaign ${campaignDir}${RESET}`)
  await runCampaign({
    campaignDir,
    concurrency: flags.concurrency,
    onEvent: campaignEventPrinter,
  })
}

async function runCampaignStatus(flags: Flags): Promise<void> {
  const campaignDir = flags.positional[0] ?? latestCampaignDir()
  if (!campaignDir) {
    console.error(`✗ no campaign found under ${getSkillCampaignsDir()}`)
    process.exit(1)
  }
  let status
  try {
    status = campaignStatus(campaignDir)
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  const { state, manifest } = status

  if (flags.json) {
    console.log(JSON.stringify({ campaign: state, manifest }, null, 2))
    return
  }

  console.log(`${MAGENTA}Campaign${RESET} ${DIM}(${campaignDir})${RESET}`)
  console.log(`  runId:    ${manifest.runId}`)
  console.log(
    `  identity: library=${manifest.identity.librarySha} tasks=${manifest.identity.taskSetSha} model=${manifest.identity.model}`,
  )
  const bandOf = new Map<string, string>()
  for (const id of state.bands.dev) bandOf.set(id, "dev")
  for (const id of state.bands.heldout) bandOf.set(id, "heldout")
  for (const id of [...state.bands.dev, ...state.bands.heldout]) {
    const t = manifest.tasks[id]
    if (!t) continue
    const color =
      t.status === "done" ? GREEN : t.status === "failed" ? RED : t.status === "running" ? CYAN : YELLOW
    console.log(
      `    ${color}${t.status.padEnd(7)}${RESET} ${id} ${DIM}(${bandOf.get(id)}) passes ${t.passes}/${t.trials}${t.retries ? ` retries ${t.retries}` : ""}${RESET}`,
    )
  }
}

async function runCampaignSub(args: string[]): Promise<void> {
  const inner = args[0]
  const flags = parseFlags(args.slice(1))
  if (flags.help || inner === "--help" || inner === "-h" || inner === "help") {
    printUsage()
    return
  }
  if (inner === "init") return runCampaignInit(flags)
  if (inner === "run") return runCampaignRun(flags)
  if (inner === "status") return runCampaignStatus(flags)
  console.error(`Unknown /aspire campaign sub-command: ${inner ?? "(missing)"}`)
  printUsage()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// evosearch
// ---------------------------------------------------------------------------

/** Resolve the most recently modified evosearch dir, or null when none. */
function latestEvoDir(): string | null {
  const root = getSkillCampaignsDir()
  try {
    if (!fs.existsSync(root)) return null
    let best: { dir: string; mtime: number } | null = null
    for (const f of fs.readdirSync(root)) {
      if (!f.startsWith("evosearch-")) continue
      const dir = path.join(root, f)
      try {
        if (!fs.statSync(dir).isDirectory()) continue
        const mtime = fs.statSync(dir).mtimeMs
        if (!best || mtime > best.mtime) best = { dir, mtime }
      } catch {
        /* skip unreadable entries */
      }
    }
    return best?.dir ?? null
  } catch {
    return null
  }
}

function evoEventPrinter(event: EvoEvent): void {
  switch (event.kind) {
    case "iteration-start":
      console.log(`${CYAN}▶${RESET} iteration ${event.iteration} ${DIM}— authoring ${event.k} candidate(s)${RESET}`)
      break
    case "candidate-authored":
      console.log(`${CYAN}◆${RESET} candidate ${event.name} ${DIM}(seeded from ${event.seededFrom})${RESET}`)
      break
    case "candidate-evaluated":
      console.log(
        `${event.pass ? GREEN : RED}${event.pass ? "✓" : "✗"}${RESET} ${event.name} ${DIM}→ ${event.pass ? "PASS" : `FAIL ${event.stage ?? ""} ${event.reason ?? ""}`}${RESET}`,
      )
      break
    case "leaderboard":
      console.log(`${DIM}  iter ${event.iteration}: best ${event.best ?? "(none)"} @ ${event.bestPassRate}${RESET}`)
      break
    case "evosearch-done":
      console.log(
        `${GREEN}✓${RESET} evosearch done ${DIM}(${event.stopReason})${RESET} — best ${CYAN}${event.best ?? "(none)"}${RESET} @ ${event.bestPassRate}`,
      )
      break
    default:
      printEvoEvent(event)
  }
}

async function runEvoInit(flags: Flags): Promise<void> {
  const taskFile = flags.positional[0]
  if (!taskFile) {
    console.error(`Usage: momo /aspire evosearch init <task.json> [--k=N] [--out=dir]`)
    process.exit(1)
  }
  let state
  try {
    const task = readJsonFile<SkillTask>(taskFile)
    state = initEvosearch({ task, k: flags.k, outDir: flags.out })
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  console.log(`${GREEN}✓${RESET} evosearch initialized at ${CYAN}${state.dir}${RESET}`)
  console.log(`  task: ${state.task.id}  k=${state.k}`)
  console.log(`${DIM}Run it with: momo /aspire evosearch run ${state.dir}${RESET}`)
}

async function runEvoRun(flags: Flags): Promise<void> {
  const stateDir = flags.positional[0] ?? latestEvoDir()
  if (!stateDir) {
    console.error(`✗ no evosearch found under ${getSkillCampaignsDir()} — run 'evosearch init' first`)
    process.exit(1)
  }
  if (!fs.existsSync(path.join(stateDir, "state.json"))) {
    console.error(`✗ not an evosearch directory: ${stateDir}`)
    process.exit(1)
  }
  console.log(`${DIM}→ running evosearch ${stateDir}${RESET}`)
  try {
    const state = await runEvosearch({
      stateDir,
      maxIterations: flags.maxIterations,
      threshold: flags.threshold,
      onEvent: evoEventPrinter,
    })
    console.log(
      `${DIM}stop: ${state.stopReason} · iterations: ${state.iteration} · eliminated: ${state.eliminated.length}${RESET}`,
    )
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

async function runEvoStatus(flags: Flags): Promise<void> {
  const stateDir = flags.positional[0] ?? latestEvoDir()
  if (!stateDir) {
    console.error(`✗ no evosearch found under ${getSkillCampaignsDir()}`)
    process.exit(1)
  }
  let state
  try {
    state = loadEvoState(stateDir)
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // leaderboards per completed iteration
  const boards: unknown[] = []
  for (let i = 1; i <= state.iteration; i++) {
    const boardFile = path.join(stateDir, `iter${i}`, "leaderboard.json")
    if (fs.existsSync(boardFile)) boards.push(JSON.parse(fs.readFileSync(boardFile, "utf-8")))
  }
  const evaluated = state.candidates.filter((c) => c.status !== "pending")

  if (flags.json) {
    console.log(JSON.stringify({ state, boards }, null, 2))
    return
  }

  console.log(`${MAGENTA}Evosearch${RESET} ${DIM}(${stateDir})${RESET}`)
  console.log(`  task:      ${state.task.id}  k=${state.k}`)
  console.log(
    `  iteration: ${state.iteration}${state.stopReason ? `  stop: ${state.stopReason}` : "  (not finished)"}`,
  )
  for (const b of boards as Array<{ iteration: number; best: string | null; bestPassRate: number }>) {
    console.log(`    ${DIM}iter ${b.iteration}: best ${b.best ?? "(none)"} @ ${b.bestPassRate}${RESET}`)
  }
  console.log(`  candidates: ${evaluated.length} evaluated, ${state.eliminated.length} eliminated`)
  if (state.eliminated.length > 0) {
    console.log(`  ${DIM}eliminated ledger:${RESET}`)
    for (const e of state.eliminated) {
      console.log(`    ${DIM}[iter ${e.iteration}] ${e.hypothesis} — ${e.reason}${RESET}`)
    }
  }
  const bestFile = path.join(stateDir, "evosearch_best.md")
  if (fs.existsSync(bestFile)) console.log(`  best:      ${CYAN}${bestFile}${RESET}`)
}

async function runEvoSub(args: string[]): Promise<void> {
  const inner = args[0]
  const flags = parseFlags(args.slice(1))
  if (flags.help || inner === "--help" || inner === "-h" || inner === "help") {
    printUsage()
    return
  }
  if (inner === "init") return runEvoInit(flags)
  if (inner === "run") return runEvoRun(flags)
  if (inner === "status") return runEvoStatus(flags)
  console.error(`Unknown /aspire evosearch sub-command: ${inner ?? "(missing)"}`)
  printUsage()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runAspireCommand(args: string[]): Promise<void> {
  const sub = args[0]
  const flags = parseFlags(args.slice(1))

  if (flags.help || sub === "--help" || sub === "-h" || sub === "help") {
    printUsage()
    return
  }

  if (sub === "init") return runInit(flags)
  if (sub === "status") return runStatus(flags)
  if (sub === "lint") return runLint(flags)
  if (sub === "verify") return runVerify(flags)
  if (sub === "apply") return runApply(flags)
  if (sub === "grade") return runGrade(flags)
  if (sub === "campaign") return runCampaignSub(args.slice(1))
  if (sub === "evosearch") return runEvoSub(args.slice(1))

  if (sub && !sub.startsWith("--")) {
    console.error(`Unknown /aspire sub-command: ${sub}`)
  }
  printUsage()
  process.exit(1)
}
