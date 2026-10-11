// SPDX-License-Identifier: MIT
// momo-bench — Three-Tier Evaluation Framework
// selection (60%) / holdout (30%) / canary (10% frozen)

import fs from "fs"
import path from "path"
import os from "os"
import { execSync } from "child_process"

const MOMO_DIR = path.join(os.homedir(), ".momo")
const BENCH_DIR = process.env.MOMO_BENCH_DIR || path.join(MOMO_DIR, "bench")

export interface BenchTask {
  id: string
  name: string
  type: "unit" | "integration" | "e2e"
  snapshot: { repo: string; commit: string; archiveHash?: string }
  prompt: string
  split: "development" | "selection" | "holdout"
  tags: string[]
  seed: number
  runtimeImageDigest: string
  verifier: {
    version: string
    executable: string
    args: string[]
    timeoutMs: number
    resultSchemaVersion: string
    protectedArtifactHash: string
  }
  budget: { maxToolSteps: number; maxWallMs: number; maxCostUsd: number }
  expected: {
    pass: boolean
    files?: string[]
    outputContains?: string[]
  }
}

export interface BenchResult {
  taskId: string
  passed: boolean
  latencyMs: number
  tokenUsage: { input: number; output: number }
  logs: string
}

export interface BenchSuite {
  selection: BenchTask[] // 60% — used for tactic optimization
  holdout: BenchTask[]   // 30% — used for gate validation
  canary: BenchTask[]    // 10% — frozen, never seen by auto-pipeline
}

/**
 * Load bench suite from ~/.momo/bench/tasks/
 * If not present, return a minimal default set.
 */
export function loadBenchSuite(): BenchSuite {
  const tasksDir = path.join(BENCH_DIR, "tasks")
  if (!fs.existsSync(tasksDir)) {
    return getDefaultSuite()
  }

  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json"))
  const tasks: BenchTask[] = files.map((f) => {
    const raw = fs.readFileSync(path.join(tasksDir, f), "utf-8")
    return JSON.parse(raw) as BenchTask
  })

  // Deterministic split by task hash
  const selection: BenchTask[] = []
  const holdout: BenchTask[] = []
  const canary: BenchTask[] = []

  for (const task of tasks) {
    const h = hashString(task.id)
    const bucket = h % 10
    if (bucket < 6) selection.push(task)
    else if (bucket < 9) holdout.push(task)
    else canary.push(task)
  }

  return { selection, holdout, canary }
}

/**
 * Run a single bench task with snapshot isolation.
 */
export async function runBenchTask(task: BenchTask): Promise<BenchResult> {
  const start = Date.now()

  // In production: checkout snapshotRef, run agent on task, collect results
  // For now: return simulated result (P0 honest)
  console.warn(`[SIMULATED] runBenchTask(${task.id}) — not real execution`)

  return {
    taskId: task.id,
    passed: Math.random() > 0.3, // [SIMULATED]
    latencyMs: Date.now() - start,
    tokenUsage: { input: 0, output: 0 },
    logs: "[simulated]",
  }
}

/**
 * Run full suite and return pass@1 per tier.
 */
export async function runBenchSuite(suite: BenchSuite): Promise<{
  selectionPassAt1: number
  holdoutPassAt1: number
  canaryPassAt1: number
  results: BenchResult[]
}> {
  const allTasks = [...suite.selection, ...suite.holdout, ...suite.canary]
  const results: BenchResult[] = []

  for (const task of allTasks) {
    results.push(await runBenchTask(task))
  }

  const passAt1 = (tasks: BenchTask[]) => {
    const subset = results.filter((r) => tasks.some((t) => t.id === r.taskId))
    const passed = subset.filter((r) => r.passed).length
    return subset.length > 0 ? passed / subset.length : 0
  }

  return {
    selectionPassAt1: passAt1(suite.selection),
    holdoutPassAt1: passAt1(suite.holdout),
    canaryPassAt1: passAt1(suite.canary),
    results,
  }
}

/**
 * Paired A/B test: run task with and without tactic.
 * Returns confidence interval of the difference.
 */
export async function runPairedAB(
  task: BenchTask,
  withTactic: boolean,
): Promise<{ pass: boolean; latencyMs: number }> {
  // In production: run twice with snapshot isolation
  // For now: [SIMULATED]
  console.warn(`[SIMULATED] runPairedAB(${task.id}, tactic=${withTactic})`)
  return {
    pass: Math.random() > 0.3,
    latencyMs: 1000 + Math.random() * 2000,
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function getDefaultSuite(): BenchSuite {
  // Minimal default suite (will be overridden by user tasks)
  return {
    selection: [],
    holdout: [],
    canary: [],
  }
}
