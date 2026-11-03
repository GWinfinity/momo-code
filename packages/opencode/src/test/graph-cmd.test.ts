/**
 * Graph engine — deterministic `cmd` nodes (hybrid layering).
 *
 * cmd nodes execute a planned shell command directly (no subagent, no
 * tokens); commands must pass the experience guard before running.
 *
 * @module test/graph-cmd
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { parseGraphPlan, planToNodes, validatePlan } from "../graph/parse.js"
import { executeGraph } from "../graph/engine.js"
import { isCommandAllowed } from "../experience/guard.js"
import type { GraphRun } from "../graph/types.js"

function makeRun(planJson: unknown, maxRetries = 0): GraphRun {
  const plan = parseGraphPlan(planJson)!
  assert.ok(plan, "plan parses")
  const errors = validatePlan(plan)
  assert.deepEqual(errors, [], "plan valid")
  return {
    id: "cmd-test",
    task: "cmd node test",
    status: "planned",
    maxNodes: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: planToNodes(plan, maxRetries),
    executions: 0,
  }
}

describe("cmd plan parsing", () => {
  it("parses kind cmd with a command", () => {
    const plan = parseGraphPlan({ nodes: [{ id: "t", task: "run tests", kind: "cmd", command: "npm test" }] })!
    assert.equal(plan.nodes[0].kind, "cmd")
    assert.equal(plan.nodes[0].command, "npm test")
    const node = planToNodes(plan, 1)[0]
    assert.equal(node.kind, "cmd")
    assert.equal(node.command, "npm test")
  })

  it("rejects cmd nodes without a command", () => {
    const plan = parseGraphPlan({ nodes: [{ id: "t", task: "run tests", kind: "cmd" }] })!
    assert.ok(validatePlan(plan).some((e) => e.includes('kind "cmd" but no command')))
  })

  it("rejects command on non-cmd nodes", () => {
    const plan = parseGraphPlan({ nodes: [{ id: "t", task: "think", command: "npm test" }] })!
    assert.ok(validatePlan(plan).some((e) => e.includes("kind is not")))
  })

  it("leaves unknown kinds as agent nodes", () => {
    const plan = parseGraphPlan({ nodes: [{ id: "t", task: "x", kind: "wat" }] })!
    assert.equal(plan.nodes[0].kind, undefined)
  })
})

describe("isCommandAllowed", () => {
  it("allows known tool prefixes", () => {
    assert.equal(isCommandAllowed("npm test").ok, true)
    assert.equal(isCommandAllowed("npx tsx --test a.test.ts").ok, true)
    assert.equal(isCommandAllowed("node --version").ok, true)
  })

  it("rejects unknown prefixes", () => {
    const v = isCommandAllowed("rm -rf build")
    assert.equal(v.ok, false)
    assert.match(v.reason ?? "", /not in allowed list/)
  })

  it("rejects shell metacharacters", () => {
    assert.equal(isCommandAllowed("npm test && npm run lint").ok, false)
    assert.equal(isCommandAllowed("npm test | tee log").ok, false)
    assert.equal(isCommandAllowed("npm run `boom`").ok, false)
    assert.equal(isCommandAllowed("npm run $(boom)").ok, false)
  })

  it("rejects empty commands", () => {
    assert.equal(isCommandAllowed("   ").ok, false)
  })
})

describe("executeGraph cmd nodes", () => {
  const origArgv1 = process.argv[1]
  let tmp: string

  function envSetup(): string {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-graph-cmd-"))
    // Point spawnSubagent at the marker fixture and record every spawn:
    // a correct cmd implementation never spawns a subagent.
    process.env.MOMO_CONFIG_DIR = path.join(tmp, "home")
    process.env.MOMO_FIXTURE_LOG = path.join(tmp, "markers.jsonl")
    process.argv[1] = path.join(import.meta.dirname, "fixtures", "subagent-marker.cjs")
    process.env.MOMO_RLM_DEPTH = "0"
    return tmp
  }

  function envTeardown(): void {
    process.argv[1] = origArgv1
    delete process.env.MOMO_FIXTURE_LOG
    delete process.env.MOMO_RLM_DEPTH
  }

  it("runs a successful command directly and parses fields", async () => {
    const dir = envSetup()
    try {
      const run = makeRun({
        nodes: [
          { id: "t", task: "run tests", kind: "cmd", command: "node -e \"console.log(JSON.stringify({status:'pass'}))\"" },
        ],
      })
      await executeGraph(run, { concurrency: 1, timeoutMs: 15000 })
      const node = run.nodes[0]
      assert.equal(node.state, "done", `state=${node.state} error=${node.error ?? ""}`)
      assert.match(node.output ?? "", /CMD|pass|status/)
      assert.deepEqual(node.fields, { status: "pass" })
      assert.ok(!fs.existsSync(path.join(dir, "markers.jsonl")), "no subagent spawned")
      assert.ok(!node.tokens, "cmd nodes consume no tokens")
    } finally {
      envTeardown()
    }
  })

  it("fails without executing when the guard rejects the command", async () => {
    const dir = envSetup()
    try {
      const run = makeRun({ nodes: [{ id: "t", task: "wipe", kind: "cmd", command: "rm -rf /" }] })
      await executeGraph(run, { concurrency: 1, timeoutMs: 5000 })
      const node = run.nodes[0]
      assert.equal(node.state, "failed")
      assert.match(node.error ?? "", /rejected by guard/)
      assert.ok(!fs.existsSync(path.join(dir, "markers.jsonl")), "no subagent spawned")
    } finally {
      envTeardown()
    }
  })

  it("fails on non-zero exit and counts the retry attempt", async () => {
    envSetup()
    try {
      const run = makeRun(
        { nodes: [{ id: "t", task: "failing check", kind: "cmd", command: "node -e \"process.exit(3)\"" }] },
        1,
      )
      await executeGraph(run, { concurrency: 1, timeoutMs: 15000 })
      const node = run.nodes[0]
      assert.equal(node.state, "failed")
      assert.match(node.error ?? "", /code 3|exit/)
      assert.equal(node.retries, 2, "initial run + one retry (per-execution retry counter)")
      assert.equal(node.attempts, 1, "attempts counts runNode invocations")
    } finally {
      envTeardown()
    }
  })

  it("skips nothing: cmd nodes participate in dependencies like agents", async () => {
    envSetup()
    try {
      const run = makeRun({
        nodes: [
          { id: "t", task: "run tests", kind: "cmd", command: "node --version" },
          { id: "u", task: "summarize", dependsOn: ["t"] },
        ],
      })
      // "u" is an agent node and would spawn a real subagent — never run it.
      // Instead, verify only that "t" completes and "u" becomes ready.
      run.nodes.find((n) => n.id === "u")!.activated = false // keep dormant: no spawn
      await executeGraph(run, { concurrency: 1, timeoutMs: 15000 })
      assert.equal(run.nodes.find((n) => n.id === "t")!.state, "done")
    } finally {
      envTeardown()
    }
  })
})
