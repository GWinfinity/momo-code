/**
 * Graph engine — resource-aware batch scheduling.
 *
 * pickBatch must keep nodes that declare overlapping resources out of the
 * same execution batch (they serialize across batches), while independent
 * nodes still run in parallel inside a batch.
 *
 * @module test/graph-resources
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { parseGraphPlan, pickBatch, planToNodes } from "../graph/parse.js"
import { executeGraph } from "../graph/engine.js"
import type { GraphNode, GraphRun } from "../graph/types.js"

// ---------------------------------------------------------------------------
// pickBatch (pure)
// ---------------------------------------------------------------------------

describe("pickBatch", () => {
  const node = (id: string, resources?: string[]): GraphNode =>
    ({ id, task: id, kind: "agent", dependsOn: [], state: "pending", retries: 0, maxRetries: 0, attempts: 0, activated: true, ...(resources ? { resources } : {}) }) as GraphNode

  it("takes up to concurrency nodes in plan order", () => {
    const batch = pickBatch([node("a"), node("b"), node("c")], 2)
    assert.deepEqual(batch.map((n) => n.id), ["a", "b"])
  })

  it("skips nodes whose resources overlap an already-picked node", () => {
    const batch = pickBatch([node("a", ["file:x"]), node("b", ["file:x"]), node("c")], 4)
    assert.deepEqual(batch.map((n) => n.id), ["a", "c"])
  })

  it("runs resource-free nodes without constraint", () => {
    const batch = pickBatch([node("a"), node("b"), node("c")], 4)
    assert.deepEqual(batch.map((n) => n.id), ["a", "b", "c"])
  })

  it("allows disjoint resources in one batch", () => {
    const batch = pickBatch([node("a", ["file:x"]), node("b", ["file:y"])], 4)
    assert.deepEqual(batch.map((n) => n.id), ["a", "b"])
  })

  it("honours multiple resources per node", () => {
    const batch = pickBatch([node("a", ["file:x", "file:z"]), node("b", ["file:z"]), node("c")], 4)
    assert.deepEqual(batch.map((n) => n.id), ["a", "c"])
  })

  it("never returns an empty batch when concurrency >= 1", () => {
    const batch = pickBatch([node("a", ["r"]), node("b", ["r"])], 1)
    assert.deepEqual(batch.map((n) => n.id), ["a"])
  })
})

// ---------------------------------------------------------------------------
// executeGraph (integration via fake subagent)
// ---------------------------------------------------------------------------

describe("executeGraph resource serialization", () => {
  const origArgv1 = process.argv[1]
  const origDepth = process.env.MOMO_RLM_DEPTH
  let tmp: string
  let markerLog: string

  it("serializes same-resource nodes and parallelizes independent ones", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-graph-res-"))
    markerLog = path.join(tmp, "markers.jsonl")
    const fixture = path.join(import.meta.dirname, "fixtures", "subagent-marker.cjs")

    process.env.MOMO_CONFIG_DIR = path.join(tmp, "home")
    process.env.MOMO_FIXTURE_LOG = markerLog
    process.env.MOMO_FIXTURE_SLEEP = "200"
    process.argv[1] = fixture
    process.env.MOMO_RLM_DEPTH = "0"

    const plan = parseGraphPlan({
      nodes: [
        { id: "a", task: "TASK-A", resources: ["file:shared"] },
        { id: "b", task: "TASK-B", resources: ["file:shared"] },
        { id: "c", task: "TASK-C" },
        { id: "d", task: "TASK-D" },
      ],
    })!
    assert.ok(plan, "plan parses")
    assert.deepEqual(
      planToNodes(plan, 0).find((n) => n.id === "a")?.resources,
      ["file:shared"],
      "resources thread into run nodes",
    )

    const run: GraphRun = {
      id: "res-test",
      task: "resource serialization",
      status: "planned",
      maxNodes: 8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: planToNodes(plan, 0),
      executions: 0,
    }

    try {
      await executeGraph(run, { concurrency: 4, timeoutMs: 8000 })
    } finally {
      process.argv[1] = origArgv1
      if (origDepth === undefined) delete process.env.MOMO_RLM_DEPTH
      else process.env.MOMO_RLM_DEPTH = origDepth
    }

    assert.equal(run.status, "done", "all nodes done")
    assert.ok(run.nodes.every((n) => n.state === "done"), "every node done")

    const markers = fs
      .readFileSync(markerLog, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { task: string; event: string; ts: number })
    const interval = (token: string) => {
      const start = markers.find((m) => m.event === "start" && m.task.includes(token))!
      const end = markers.find((m) => m.event === "end" && m.task.includes(token))!
      return [start.ts, end.ts] as const
    }
    const overlaps = (x: readonly [number, number], y: readonly [number, number]) =>
      x[0] < y[1] && y[0] < x[1]

    const a = interval("TASK-A")
    const b = interval("TASK-B")
    const c = interval("TASK-C")

    assert.ok(!overlaps(a, b), "same-resource nodes A and B never overlap")
    assert.ok(overlaps(a, c), "independent nodes A and C run in parallel")
    assert.ok(overlaps(a, interval("TASK-D")), "independent nodes A and D run in parallel")
  })
})
