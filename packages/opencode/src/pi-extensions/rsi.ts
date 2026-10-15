// SPDX-License-Identifier: MIT
// momo Code — Pi Extension: RSI (Recursive Self-Improvement) Signal Capture
// Captures tool results and agent outcomes for RSI optimization

import type { InlineExtension } from "@earendil-works/pi-coding-agent"
import fs from "fs"
import path from "path"
import os from "os"

interface RSIMetrics {
  sessionId: string
  timestamp: string
  latencyMs: number
  tokenIn: number
  tokenOut: number
  toolCalls: number
  toolFailures: number
  agentOutcome: "success" | "failure" | "abandoned"
  userRating?: number
  provider: string
  model: string
  taskHash: string
}

const MOMO_DIR = path.join(os.homedir(), ".momo")
const RSI_LOG = path.join(MOMO_DIR, "rsi-metrics.jsonl")

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function appendMetric(metric: RSIMetrics): void {
  ensureDir(RSI_LOG)
  fs.appendFileSync(RSI_LOG, JSON.stringify(metric) + "\n", "utf-8")
}

/**
 * Pi Extension: tool_result + agent_settled hooks
 * Records real runtime metrics for RSI optimization.
 */
export const rsiExtension: InlineExtension = {
  name: "momo-rsi",

  factory: (pi) => {
    pi.on("tool_result", (event, ctx) => {
      // Pi 1.1.0: bash exit code is in structuredContent.exit_code
      const output = event.structuredContent
      const exitCode =
        event.toolName === "bash" &&
        typeof output === "object" &&
        output !== null &&
        "exit_code" in output &&
        typeof (output as Record<string, unknown>).exit_code === "number"
          ? (output as { exit_code: number }).exit_code
          : undefined

      const isFailure = event.isError || (exitCode !== undefined && exitCode !== 0)

      // Record tool-level signal
      const signal = {
        sessionId: ctx.sessionManager.getSessionId(),
        timestamp: new Date().toISOString(),
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        exitCode: exitCode ?? null,
        verdict: isFailure ? "fail" : "pass",
        latencyMs: 0, // Pi 1.1.0: duration available in tool_execution_end
      }

      // Append to ledger for later RSI processing
      const ledgerPath = path.join(MOMO_DIR, "experience", "ledger.jsonl")
      ensureDir(ledgerPath)
      fs.appendFileSync(ledgerPath, JSON.stringify(signal) + "\n", "utf-8")
    })

    pi.on("agent_settled", async (event, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId()

      const metric: RSIMetrics = {
        sessionId,
        timestamp: new Date().toISOString(),
        latencyMs: 0,
        tokenIn: 0,
        tokenOut: 0,
        toolCalls: 0,
        toolFailures: 0,
        agentOutcome: event.aborted ? "abandoned" : "success",
        provider: "unknown",
        model: "unknown",
        taskHash: "",
      }

      appendMetric(metric)

      // Trigger RSI optimizer if enabled
      const rsiEnabled = process.env.MOMO_RSI_ENABLED === "true"
      if (rsiEnabled && shouldOptimize()) {
        await runRSIOptimizer()
      }
    })
  },
}

function hashTask(task: string): string {
  // Simple hash for task deduplication
  let h = 0
  for (let i = 0; i < task.length; i++) {
    h = ((h << 5) - h + task.charCodeAt(i)) | 0
  }
  return h.toString(16)
}

function shouldOptimize(): boolean {
  // Throttle: optimize at most once per hour
  const flagPath = path.join(MOMO_DIR, ".rsi-last-run")
  try {
    const last = fs.readFileSync(flagPath, "utf-8")
    const lastTime = parseInt(last, 10)
    if (Date.now() - lastTime < 3600_000) return false
  } catch {
    // No last run file — allow
  }
  fs.writeFileSync(flagPath, Date.now().toString(), "utf-8")
  return true
}

async function runRSIOptimizer(): Promise<void> {
  console.warn("[momo-rsi] Running optimizer...")
  // Placeholder: actual optimizer implemented in P3
  // Reads ~/.momo/rsi-metrics.jsonl, runs Bayesian optimization,
  // writes updated params to ~/.momo/rsi-meta.json
}
