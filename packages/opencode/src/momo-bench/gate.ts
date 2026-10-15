// SPDX-License-Identifier: MIT
// momo-bench Gate — 晋升门与反向测试

import type { BenchResult } from "./index.js"

export type GateDecision = "accept" | "reject" | "inconclusive"

export interface GateResult {
  decision: GateDecision
  metricVersion: string
  baselineVersion: string
  candidateVersion: string
  effectiveSampleSize: number
  keyRegressions: string[]
  interval?: { lower: number; upper: number }
  dataGrouping: string
  reason: string
}

// ── 反向测试定义 (Section 9.6) ────────────────────────────────────

export interface ReverseTestCase {
  name: string
  description: string
  expectedDecision: GateDecision
  setup: () => { baseline: BenchResult[]; candidate: BenchResult[] }
}

export const REVERSE_TESTS: ReverseTestCase[] = [
  {
    name: "obviously-broken-tactic",
    description: "明显破坏功能的 tactic 应该被拒绝",
    expectedDecision: "reject",
    setup: () => ({
      baseline: [makeResult("t1", true), makeResult("t2", true)],
      candidate: [makeResult("t1", false), makeResult("t2", false)],
    }),
  },
  {
    name: "delete-tests-to-pass",
    description: "删除测试以'减少失败'应该被拒",
    expectedDecision: "reject",
    setup: () => ({
      baseline: [makeResult("t1", true), makeResult("t2", false)],
      candidate: [makeResult("t1", true)], // missing t2
    }),
  },
  {
    name: "fake-score-exit-nonzero",
    description: "输出 score=1 但进程 exit 1 应该被拒",
    expectedDecision: "reject",
    setup: () => ({
      baseline: [makeResult("t1", true)],
      candidate: [makeResult("t1", false)],
    }),
  },
  {
    name: "identical-to-baseline",
    description: "与 baseline 完全相同不应声称提升",
    expectedDecision: "inconclusive",
    setup: () => ({
      baseline: [makeResult("t1", true), makeResult("t2", true)],
      candidate: [makeResult("t1", true), makeResult("t2", true)],
    }),
  },
  {
    name: "cost-down-no-regression",
    description: "功能全通过且真实降低时间应按成本目标评估",
    expectedDecision: "accept",
    setup: () => ({
      baseline: [makeResult("t1", true), makeResult("t2", true)],
      candidate: [makeResult("t1", true), makeResult("t2", true)],
    }),
  },
  {
    name: "insufficient-data",
    description: "没有可用任务或不足证据应返回 inconclusive",
    expectedDecision: "inconclusive",
    setup: () => ({
      baseline: [],
      candidate: [],
    }),
  },
  {
    name: "improve-dev-hurt-holdout",
    description: "改善开发集、破坏留出集应被拒",
    expectedDecision: "reject",
    setup: () => ({
      baseline: [makeResult("t1", true), makeResult("t2", true)],
      candidate: [makeResult("t1", true), makeResult("t2", false)],
    }),
  },
]

function makeResult(taskId: string, passed: boolean): BenchResult {
  return {
    taskId,
    passed,
    latencyMs: 1000,
    tokenUsage: { input: 0, output: 0 },
    logs: "",
  }
}

// ── Gate evaluator ────────────────────────────────────────────────

export function evaluateGate(
  baseline: BenchResult[],
  candidate: BenchResult[],
  opts: {
    metricVersion: string
    baselineVersion: string
    candidateVersion: string
    minSampleSize?: number
    requireZeroRegressions?: boolean
  },
): GateResult {
  const minSample = opts.minSampleSize ?? 1

  if (baseline.length < minSample || candidate.length < minSample) {
    return {
      decision: "inconclusive",
      metricVersion: opts.metricVersion,
      baselineVersion: opts.baselineVersion,
      candidateVersion: opts.candidateVersion,
      effectiveSampleSize: Math.min(baseline.length, candidate.length),
      keyRegressions: [],
      dataGrouping: "all",
      reason: "Insufficient data",
    }
  }

  const baselinePass = baseline.filter((r) => r.passed).length / baseline.length
  const candidatePass = candidate.filter((r) => r.passed).length / candidate.length

  // Find regressions: tasks that baseline passed but candidate failed
  const regressions: string[] = []
  for (const b of baseline) {
    if (!b.passed) continue
    const c = candidate.find((r) => r.taskId === b.taskId)
    if (c && !c.passed) {
      regressions.push(b.taskId)
    }
  }

  if (opts.requireZeroRegressions && regressions.length > 0) {
    return {
      decision: "reject",
      metricVersion: opts.metricVersion,
      baselineVersion: opts.baselineVersion,
      candidateVersion: opts.candidateVersion,
      effectiveSampleSize: Math.min(baseline.length, candidate.length),
      keyRegressions: regressions,
      dataGrouping: "paired",
      reason: `Regressions on ${regressions.length} task(s)`,
    }
  }

  // Identical to baseline → inconclusive
  if (baselinePass === candidatePass && baseline.length === candidate.length) {
    const allMatch = baseline.every((b) => {
      const c = candidate.find((r) => r.taskId === b.taskId)
      return c && b.passed === c.passed
    })
    if (allMatch) {
      return {
        decision: "inconclusive",
        metricVersion: opts.metricVersion,
        baselineVersion: opts.baselineVersion,
        candidateVersion: opts.candidateVersion,
        effectiveSampleSize: baseline.length,
        keyRegressions: [],
        dataGrouping: "paired",
        reason: "Identical to baseline",
      }
    }
  }

  // Simple threshold gate (placeholder for proper statistical test)
  if (candidatePass >= baselinePass) {
    return {
      decision: "accept",
      metricVersion: opts.metricVersion,
      baselineVersion: opts.baselineVersion,
      candidateVersion: opts.candidateVersion,
      effectiveSampleSize: Math.min(baseline.length, candidate.length),
      keyRegressions: regressions,
      interval: { lower: candidatePass - 0.1, upper: candidatePass + 0.1 },
      dataGrouping: "paired",
      reason: `Pass rate ${candidatePass.toFixed(2)} vs baseline ${baselinePass.toFixed(2)}`,
    }
  }

  return {
    decision: "reject",
    metricVersion: opts.metricVersion,
    baselineVersion: opts.baselineVersion,
    candidateVersion: opts.candidateVersion,
    effectiveSampleSize: Math.min(baseline.length, candidate.length),
    keyRegressions: regressions,
    dataGrouping: "paired",
    reason: `Pass rate ${candidatePass.toFixed(2)} below baseline ${baselinePass.toFixed(2)}`,
  }
}
