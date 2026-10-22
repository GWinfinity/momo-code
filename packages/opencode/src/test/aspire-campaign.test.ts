import { describe, it, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
  initCampaign,
  runCampaign,
  campaignStatus,
  computeRunId,
  computeTaskSetSha,
  parseTasksFile,
  type CampaignEvent,
  type SpawnRunner,
} from "../skill/coordinator"
import { stageWorkerPrompt, buildWorkerArgv } from "../skill/dispatch"
import { getSkillsDir, librarySha } from "../skill/store"
import type { SubagentResult } from "../subagent/spawn"
import type { SkillTask } from "../skill/schema"

// ---------------------------------------------------------------------------
// Per-test home isolation: each test gets its own MOMO_CONFIG_DIR.
// ---------------------------------------------------------------------------

const homes: string[] = []
let savedHome: string | undefined

function useHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-aspire-campaign-"))
  homes.push(dir)
  if (savedHome === undefined) savedHome = process.env.MOMO_CONFIG_DIR
  process.env.MOMO_CONFIG_DIR = dir
  return dir
}

after(() => {
  if (savedHome === undefined) delete process.env.MOMO_CONFIG_DIR
  else process.env.MOMO_CONFIG_DIR = savedHome
  for (const dir of homes) fs.rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Fake subagent runner: writes the artifacts a real worker/verifier would
// write, straight to disk, and returns a canned SubagentResult.
// ---------------------------------------------------------------------------

function fakeResult(task: string, exitCode: number, output: string): SubagentResult {
  return {
    task,
    output,
    stderrOutput: "",
    exitCode,
    durationMs: 1,
    timedOut: false,
    depth: 1,
  }
}

function taskDirFromInstruction(instruction: string): string {
  const m = /Read the file (\S+) and follow it exactly/.exec(instruction)
  if (!m) throw new Error(`fake runner: cannot parse instruction: ${instruction}`)
  return path.dirname(m[1])
}

function validReport(): Record<string, unknown> {
  return {
    skillLibrarySha: "0".repeat(16),
    consulted: [
      {
        skill: "mathutils",
        section: "Doubling",
        verdict: "useful",
        evidence: "the doubling helper matched the reference implementation on this task",
      },
    ],
    proposedEdits: [],
    proposedNew: [
      {
        skill: "mathutils",
        title: "Double a number",
        trigger: "need to double a numeric value",
        code: "export function double(x: number): number {\n  return x * 2\n}",
        evidence: "verified on this task, 3/3 passes",
      },
    ],
  }
}

interface FakeOpts {
  /** What workers write as skill_report.json. */
  report?: "valid" | "invalid" | "missing"
  /** Verifier subagent outcome (no-args spawn = verifier prompt). */
  verify?: "pass" | "fail"
  heldoutPass?: boolean
}

function makeFakeRunner(opts: FakeOpts): {
  runner: SpawnRunner
  workerCalls: string[]
  verifierCalls: { count: number }
  heldoutCalls: string[]
} {
  const workerCalls: string[] = []
  const heldoutCalls: string[] = []
  const verifierCalls = { count: 0 }
  const runner: SpawnRunner = async (task, spawnOpts) => {
    // verifier spawns pass the prompt as `task` with no explicit argv
    if (!spawnOpts.args) {
      verifierCalls.count++
      if (opts.verify === "fail") {
        return fakeResult(task, 1, "I could not complete the task.\nTASK-FAILED")
      }
      return fakeResult(task, 0, "task completed, check passed")
    }
    const instruction = spawnOpts.args[0]
    const taskDir = taskDirFromInstruction(instruction)
    if (instruction.includes("heldout_outcome.json")) {
      heldoutCalls.push(task)
      fs.writeFileSync(
        path.join(taskDir, "heldout_outcome.json"),
        JSON.stringify({ pass: opts.heldoutPass ?? true, notes: "one attempt, check passed" }),
      )
      return fakeResult(task, 0, "done")
    }
    workerCalls.push(task)
    if (opts.report !== "missing") {
      const report =
        opts.report === "invalid"
          ? { skillLibrarySha: "zzz", consulted: [{ verdict: "helpful" }] }
          : validReport()
      fs.writeFileSync(path.join(taskDir, "skill_report.json"), JSON.stringify(report))
    }
    return fakeResult(task, 0, "done")
  }
  return { runner, workerCalls, verifierCalls, heldoutCalls }
}

// ---------------------------------------------------------------------------

function writeTasksFile(dir: string, tasks: unknown[]): string {
  const file = path.join(dir, "tasks.json")
  fs.writeFileSync(file, JSON.stringify(tasks), "utf-8")
  return file
}

function sampleTasks(): SkillTask[] {
  return [
    { id: "dev-1", prompt: "Solve task one.", check: "npm test", band: "dev" },
    { id: "dev-2", prompt: "Solve task two.", check: "npx tsc --noEmit", band: "dev" },
    { id: "hold-1", prompt: "Solve the heldout task.", check: "npm test", band: "heldout" },
  ]
}

describe("skill/coordinator initCampaign", () => {
  it("creates dirs + files and a manifest whose runId matches the sha formula", () => {
    const home = useHome()
    const file = writeTasksFile(home, sampleTasks())
    const state = initCampaign({ tasksFile: file, name: "demo" })
    assert.ok(fs.existsSync(path.join(state.dir, "campaign.json")))
    assert.ok(fs.existsSync(path.join(state.dir, "manifest.json")))
    assert.match(path.basename(state.dir), /_demo$/)

    const { manifest } = campaignStatus(state.dir)
    assert.deepStrictEqual(manifest.identity, {
      librarySha: librarySha(getSkillsDir()),
      taskSetSha: computeTaskSetSha(sampleTasks()),
      model: process.env.MOMO_MODEL || "default",
    })
    assert.strictEqual(manifest.runId, computeRunId(manifest.identity))
    for (const id of ["dev-1", "dev-2", "hold-1"]) {
      assert.deepStrictEqual(manifest.tasks[id], { status: "pending", passes: 0, trials: 0 })
    }
    assert.deepStrictEqual(state.bands.dev, ["dev-1", "dev-2"])
    assert.deepStrictEqual(state.bands.heldout, ["hold-1"])
  })

  it("rejects duplicate ids across bands", () => {
    const tasks = [...sampleTasks(), { id: "dev-1", prompt: "again", check: "npm test", band: "heldout" as const }]
    assert.throws(() => parseTasksFile(tasks), /duplicate task id 'dev-1'/)
  })

  it("rejects a tasks file with no heldout band", () => {
    const tasks = sampleTasks().filter((t) => t.band !== "heldout")
    assert.throws(() => parseTasksFile(tasks), /at least one heldout/)
  })

  it("rejects a tasks file with no dev band", () => {
    const tasks = sampleTasks().filter((t) => t.band !== "dev")
    assert.throws(() => parseTasksFile(tasks), /at least one dev/)
  })

  it("rejects check commands outside the whitelist", () => {
    const tasks = [
      { id: "dev-1", prompt: "x", check: "rm -rf /", band: "dev" },
      { id: "hold-1", prompt: "y", check: "npm test", band: "heldout" },
    ]
    assert.throws(() => parseTasksFile(tasks), /not in whitelist/)
  })

  it("rejects empty prompts and bad bands", () => {
    const badPrompt = [
      { id: "dev-1", prompt: "  ", check: "npm test", band: "dev" },
      { id: "hold-1", prompt: "y", check: "npm test", band: "heldout" },
    ]
    assert.throws(() => parseTasksFile(badPrompt), /prompt is empty/)
    const badBand = [{ id: "hold-1", prompt: "y", check: "npm test", band: "qa" }]
    assert.throws(() => parseTasksFile(badBand), /band must be/)
  })
})

describe("skill/coordinator runCampaign (fake runner)", () => {
  it("drives dev tasks through gate+apply, then the heldout sweep", async () => {
    const home = useHome()
    const file = writeTasksFile(home, sampleTasks())
    const state = initCampaign({ tasksFile: file, name: "happy" })
    const fake = makeFakeRunner({ report: "valid" })
    const events: CampaignEvent[] = []

    const manifest = await runCampaign({
      campaignDir: state.dir,
      concurrency: 2,
      spawnRunner: fake.runner,
      onEvent: (e) => events.push(e),
    })

    // workers: dev-1 + dev-2 once each; heldout: hold-1 once
    assert.strictEqual(fake.workerCalls.length, 2)
    assert.strictEqual(fake.heldoutCalls.length, 1)
    // one transmission test per dev task
    assert.strictEqual(fake.verifierCalls.count, 2)

    // manifest transitions
    assert.strictEqual(manifest.tasks["dev-1"].status, "done")
    assert.strictEqual(manifest.tasks["dev-2"].status, "done")
    assert.strictEqual(manifest.tasks["dev-1"].passes, 1)
    assert.strictEqual(manifest.tasks["dev-1"].trials, 1)
    assert.strictEqual(manifest.tasks["hold-1"].status, "done")
    assert.strictEqual(manifest.tasks["hold-1"].passes, 1)

    // the verified proposal landed in the library; the second dev task's
    // identical proposal replaced it in place (replace-not-annotate)
    const lib = fs.readFileSync(path.join(getSkillsDir(), "mathutils.md"), "utf-8")
    assert.ok(lib.includes("### Double a number"))
    assert.strictEqual(lib.split("### Double a number").length, 2)

    // grades recorded for both dev tasks
    const ledger = fs
      .readFileSync(path.join(getSkillsDir(), "ledger.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
    assert.strictEqual(ledger.length, 2)
    assert.strictEqual(JSON.parse(ledger[0]).kind, "grade")

    // event coverage
    const kinds = events.map((e) => e.kind)
    for (const kind of [
      "task-start",
      "task-proposals",
      "task-verified",
      "library-updated",
      "heldout-result",
      "campaign-done",
    ] as const) {
      assert.ok(kinds.includes(kind), `missing event ${kind}`)
    }
    assert.strictEqual(kinds.filter((k) => k === "task-start").length, 2)
    assert.strictEqual(
      events.filter((e) => e.kind === "task-verified" && e.verdict === "verified").length,
      2,
    )
  })

  it("refuted verification does not touch the library", async () => {
    const home = useHome()
    const file = writeTasksFile(home, sampleTasks())
    const state = initCampaign({ tasksFile: file, name: "refuted" })
    const fake = makeFakeRunner({ report: "valid", verify: "fail" })
    const events: CampaignEvent[] = []

    const manifest = await runCampaign({
      campaignDir: state.dir,
      concurrency: 2,
      spawnRunner: fake.runner,
      onEvent: (e) => events.push(e),
    })

    assert.strictEqual(manifest.tasks["dev-1"].status, "done")
    assert.strictEqual(manifest.tasks["dev-1"].trials, 1)
    assert.strictEqual(manifest.tasks["dev-1"].passes, 0)
    assert.ok(events.some((e) => e.kind === "task-verified" && e.verdict === "refuted"))
    assert.ok(!events.some((e) => e.kind === "library-updated"))
    assert.ok(!fs.existsSync(path.join(getSkillsDir(), "mathutils.md")))
  })

  it("retries invalid reports twice, then marks the task failed", async () => {
    const home = useHome()
    const file = writeTasksFile(home, sampleTasks())
    const state = initCampaign({ tasksFile: file, name: "retry" })
    const fake = makeFakeRunner({ report: "invalid" })
    const events: CampaignEvent[] = []

    const manifest = await runCampaign({
      campaignDir: state.dir,
      concurrency: 2,
      spawnRunner: fake.runner,
      onEvent: (e) => events.push(e),
    })

    // 3 attempts per dev task (initial + 2 retries)
    assert.strictEqual(fake.workerCalls.length, 6)
    assert.strictEqual(fake.verifierCalls.count, 0)
    assert.strictEqual(manifest.tasks["dev-1"].status, "failed")
    assert.strictEqual(manifest.tasks["dev-1"].retries, 3)
    assert.strictEqual(manifest.tasks["dev-2"].status, "failed")
    // heldout sweep still ran
    assert.strictEqual(manifest.tasks["hold-1"].status, "done")
    assert.strictEqual(fake.heldoutCalls.length, 1)
    // no grades, no library writes
    assert.ok(!fs.existsSync(path.join(getSkillsDir(), "ledger.jsonl")))
    assert.strictEqual(events.filter((e) => e.kind === "task-report-invalid").length, 6)
  })
})

describe("skill/dispatch prompt packages", () => {
  it("stages a self-contained worker prompt and a heldout prompt", () => {
    useHome()
    const home = process.env.MOMO_CONFIG_DIR as string
    const campaignDir = path.join(home, "skill-campaigns", "dispatch-probe")
    const task: SkillTask = { id: "dev-1", prompt: "Solve it.", check: "npm test", band: "dev" }
    const promptFile = stageWorkerPrompt({ campaignDir, task, librarySha: "0".repeat(16) })
    const text = fs.readFileSync(promptFile, "utf-8")
    assert.ok(text.includes("task dev-1"))
    assert.ok(text.includes("npm test"))
    assert.ok(text.includes("Version budget"))
    assert.ok(text.includes("skill_report.json"))
    assert.ok(text.includes("0".repeat(16)))

    const heldoutFile = stageWorkerPrompt({
      campaignDir,
      task: { ...task, id: "hold-1", band: "heldout" },
      librarySha: "0".repeat(16),
      role: "heldout",
    })
    const heldoutText = fs.readFileSync(heldoutFile, "utf-8")
    assert.ok(heldoutText.includes("heldout_outcome.json"))
    assert.ok(heldoutText.includes("ONE attempt"))

    const argv = buildWorkerArgv(promptFile)
    assert.strictEqual(argv.length, 1)
    assert.ok(argv[0].includes(promptFile))
    assert.ok(argv[0].includes("skill_report.json"))
  })
})
