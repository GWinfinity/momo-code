import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
  assertCheckAllowed,
  isCheckAllowed,
  substituteTaskDir,
  buildVerificationPrompt,
} from "../skill/verifier"
import { initCampaign } from "../skill/coordinator"
import { stageWorkerPrompt } from "../skill/dispatch"

describe("aspire sim tasks", () => {
  let tmpDir: string
  let savedConfigDir: string | undefined

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-aspire-sim-"))
    savedConfigDir = process.env.MOMO_CONFIG_DIR
    process.env.MOMO_CONFIG_DIR = tmpDir
  })

  after(() => {
    if (savedConfigDir === undefined) delete process.env.MOMO_CONFIG_DIR
    else process.env.MOMO_CONFIG_DIR = savedConfigDir
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("check whitelist exception", () => {
    it("allows python -m sim_eval checks", () => {
      assert.doesNotThrow(() =>
        assertCheckAllowed(
          "python -m sim_eval --task pick_cube --seed 3 --program {task_dir}/program.py",
        ),
      )
      assert.doesNotThrow(() => assertCheckAllowed("python3 -m sim_eval --task pick_cube --seed 1"))
    })

    it("rejects every other python/python3 invocation", () => {
      assert.throws(() => assertCheckAllowed('python -c "import os"'), /not in whitelist/)
      assert.throws(() => assertCheckAllowed("python -m pip install foo"), /not in whitelist/)
      assert.throws(() => assertCheckAllowed("python sim_eval --task x"), /not in whitelist/)
      assert.throws(() => assertCheckAllowed("python -X -m sim_eval --task x"), /not in whitelist/)
      assert.throws(() => assertCheckAllowed("python -m sim_evalx --task x"), /not in whitelist/)
      assert.throws(() => assertCheckAllowed("python3 -m pip list"), /not in whitelist/)
    })

    it("keeps the existing whitelist behavior", () => {
      assert.doesNotThrow(() => assertCheckAllowed("node sim_eval"))
      assert.doesNotThrow(() => assertCheckAllowed("npm test"))
      assert.throws(() => assertCheckAllowed("bash exploit.sh"), /not in whitelist/)
    })

    it("isCheckAllowed reports booleans for the same rules", () => {
      assert.strictEqual(isCheckAllowed("python -m sim_eval --task x"), true)
      assert.strictEqual(isCheckAllowed('python -c "import os"'), false)
      assert.strictEqual(isCheckAllowed("python -m pip install foo"), false)
      assert.strictEqual(isCheckAllowed("node sim_eval"), true)
    })
  })

  describe("substituteTaskDir", () => {
    it("replaces every {task_dir} occurrence", () => {
      const out = substituteTaskDir(
        "python -m sim_eval --program {task_dir}/program.py --log {task_dir}/run.log",
        "/camp/tasks/sim-1",
      )
      assert.strictEqual(
        out,
        "python -m sim_eval --program /camp/tasks/sim-1/program.py --log /camp/tasks/sim-1/run.log",
      )
    })

    it("leaves other text alone", () => {
      const out = substituteTaskDir("node test {task_id} task_dir {other}", "/x")
      assert.strictEqual(out, "node test {task_id} task_dir {other}")
    })

    it("passes checks without the placeholder through unchanged", () => {
      assert.strictEqual(substituteTaskDir("npm test", "/x"), "npm test")
    })
  })

  describe("buildVerificationPrompt", () => {
    const task = {
      id: "sim-dev",
      prompt: "Solve the sim task.",
      check: "python -m sim_eval --task pick_cube --seed 1 --program {task_dir}/program.py",
      band: "dev" as const,
    }

    function stageInputs() {
      const libDir = path.join(tmpDir, "lib")
      fs.mkdirSync(libDir, { recursive: true })
      fs.writeFileSync(path.join(libDir, "sim.md"), "## Sim\n\n```ts\nconst x = 1\n```\n")
      const proposal = path.join(tmpDir, "proposal.md")
      fs.writeFileSync(proposal, "## Proposed\n\n```ts\nconst y = 2\n```\n")
      return { libraryDir: libDir, proposalFile: proposal }
    }

    it("expands {task_dir} to the given task dir and drops the placeholder", () => {
      const inputs = stageInputs()
      const taskDir = path.join(tmpDir, "campaign", "tasks", "sim-dev")
      const prompt = buildVerificationPrompt({ ...inputs, task, taskDir })
      assert.ok(!prompt.includes("{task_dir}"))
      assert.ok(prompt.includes(`${taskDir}/program.py`))
    })

    it("keeps the raw placeholder when no taskDir is given", () => {
      const inputs = stageInputs()
      const prompt = buildVerificationPrompt({ ...inputs, task })
      assert.ok(prompt.includes("{task_dir}/program.py"))
    })
  })

  describe("campaign init with sim tasks", () => {
    const simCheck = (seed: number) =>
      `python -m sim_eval --task pick_cube --seed ${seed} --program {task_dir}/program.py`

    let n = 0
    function writeTasks(tasks: unknown[]): string {
      const file = path.join(tmpDir, `tasks-${++n}.json`)
      fs.writeFileSync(file, JSON.stringify(tasks), "utf-8")
      return file
    }

    it("accepts sim_eval checks and keeps the raw placeholder in campaign state", () => {
      const tasksFile = writeTasks([
        { id: "sim-dev", prompt: "Solve the dev sim task.", check: simCheck(1), band: "dev" },
        { id: "sim-hold", prompt: "Solve the heldout sim task.", check: simCheck(2), band: "heldout" },
      ])
      const state = initCampaign({ tasksFile, name: "simrun" })
      assert.ok(state.dir.startsWith(path.join(tmpDir, "skill-campaigns")))
      const dev = state.tasks.find((t) => t.id === "sim-dev")
      assert.ok(dev)
      // init validation must NOT substitute — the raw string is the definition.
      assert.strictEqual(dev.check, simCheck(1))
    })

    it("rejects a python -c check at init", () => {
      const tasksFile = writeTasks([
        { id: "dev-1", prompt: "Solve it.", check: "npm test", band: "dev" },
        { id: "hold-1", prompt: "Solve it.", check: 'python -c "import os"', band: "heldout" },
      ])
      assert.throws(() => initCampaign({ tasksFile, name: "bad" }), /not in whitelist/)
    })
  })

  describe("worker/heldout prompt staging", () => {
    it("expands {task_dir} in the staged prompt for both roles", () => {
      const campaignDir = path.join(tmpDir, "campaign-stage")
      const heldout = {
        id: "sim-hold",
        prompt: "Solve the heldout sim task.",
        check: "python -m sim_eval --task pick_cube --seed 7 --program {task_dir}/program.py",
        band: "heldout" as const,
      }
      const heldoutFile = stageWorkerPrompt({
        campaignDir,
        task: heldout,
        librarySha: "0".repeat(16),
        role: "heldout",
      })
      const heldoutStaged = fs.readFileSync(heldoutFile, "utf-8")
      assert.ok(!heldoutStaged.includes("{task_dir}"))
      assert.ok(
        heldoutStaged.includes(`${path.join(campaignDir, "tasks", "sim-hold")}/program.py`),
      )

      const workerFile = stageWorkerPrompt({
        campaignDir,
        task: { ...heldout, id: "sim-dev", band: "dev" },
        librarySha: "0".repeat(16),
      })
      const workerStaged = fs.readFileSync(workerFile, "utf-8")
      assert.ok(!workerStaged.includes("{task_dir}"))
      assert.ok(
        workerStaged.includes(`${path.join(campaignDir, "tasks", "sim-dev")}/program.py`),
      )
    })
  })
})
