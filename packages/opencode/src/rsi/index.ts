// SPDX-License-Identifier: MIT
// momo RSI — Recursive Self-Improvement (Three-Tier)
// R1: Product (prompt patches, tactics) — fully automated
// R2: Strategy (L0 decision model weights) — auto + calibration gate
// R3: Mechanism (evaluator itself) — human review required

import fs from "fs"
import path from "path"
import os from "os"

const MOMO_DIR = path.join(os.homedir(), ".momo")
const RSI_META = path.join(MOMO_DIR, "rsi-meta.json")
const RSI_LOG = path.join(MOMO_DIR, "rsi-metrics.jsonl")
const STOP_FILE = process.env.MOMO_RSI_STOP_FILE || path.join(MOMO_DIR, "STOP")

export interface RSIMeta {
  version: number
  lastOptimized: string
  params: {
    temperature: number
    maxTokens: number
    topK: number
    systemPromptWeight: number
  }
  promotionsToday: number
  lastPromotionDate: string
}

const DEFAULT_META: RSIMeta = {
  version: 1,
  lastOptimized: new Date().toISOString(),
  params: {
    temperature: 0.7,
    maxTokens: 4096,
    topK: 5,
    systemPromptWeight: 0.3,
  },
  promotionsToday: 0,
  lastPromotionDate: new Date().toDateString(),
}

export function loadMeta(): RSIMeta {
  try {
    const raw = fs.readFileSync(RSI_META, "utf-8")
    return { ...DEFAULT_META, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_META
  }
}

function saveMeta(meta: RSIMeta): void {
  fs.writeFileSync(RSI_META, JSON.stringify(meta, null, 2), "utf-8")
}

function isStopped(): boolean {
  return fs.existsSync(STOP_FILE)
}

function shouldPromote(meta: RSIMeta): boolean {
  const maxPerDay = parseInt(process.env.MOMO_RSI_MAX_PROMOTIONS_PER_DAY || "3", 10)
  const today = new Date().toDateString()
  if (meta.lastPromotionDate !== today) {
    meta.promotionsToday = 0
    meta.lastPromotionDate = today
  }
  return meta.promotionsToday < maxPerDay
}

// ── R1: Product-level optimization ────────────────────────────────

export async function r1Optimize(): Promise<void> {
  if (isStopped()) {
    console.warn("[RSI] STOP file detected. Halting.")
    return
  }

  const meta = loadMeta()

  // Read metrics
  const metrics = readMetrics()
  if (metrics.length < 10) {
    console.warn("[RSI-R1] Insufficient data (< 10 sessions). Skipping.")
    return
  }

  // Simple Bayesian update: if success rate > 0.8, lower temperature
  const recent = metrics.slice(-20)
  const successRate = recent.filter((m) => m.outcome === "success").length / recent.length

  if (successRate > 0.8 && meta.params.temperature > 0.3) {
    meta.params.temperature -= 0.05
    console.warn(`[RSI-R1] Lowered temperature to ${meta.params.temperature.toFixed(2)}`)
  } else if (successRate < 0.5 && meta.params.temperature < 1.0) {
    meta.params.temperature += 0.05
    console.warn(`[RSI-R1] Raised temperature to ${meta.params.temperature.toFixed(2)}`)
  }

  meta.lastOptimized = new Date().toISOString()
  saveMeta(meta)
}

// ── R2: Strategy-level optimization ───────────────────────────────

export async function r2Optimize(): Promise<void> {
  if (isStopped()) return

  const meta = loadMeta()
  if (!shouldPromote(meta)) {
    console.warn("[RSI-R2] Daily promotion limit reached. Skipping.")
    return
  }

  // In production: run holdout eval, compare with baseline
  // If CI lower bound > threshold, promote
  // For now: placeholder
  console.warn("[RSI-R2] Strategy optimization — placeholder (P3)")

  meta.promotionsToday++
  saveMeta(meta)
}

// ── R3: Mechanism-level optimization ──────────────────────────────

export async function r3Propose(): Promise<string | null> {
  if (isStopped()) return null

  // R3 NEVER auto-applies. Only generates proposals for human review.
  const proposal = {
    type: "mechanism-change",
    description: "Proposed: Change eval metric from pass@1 to pass@2",
    rationale: "Based on canary analysis (placeholder)",
    status: "pending-review",
  }

  const proposalPath = path.join(MOMO_DIR, "r3-proposals", `prop_${Date.now()}.json`)
  fs.mkdirSync(path.dirname(proposalPath), { recursive: true })
  fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2), "utf-8")

  console.warn(`[RSI-R3] Proposal generated: ${proposalPath}`)
  console.warn("[RSI-R3] Review required before application.")

  return proposalPath
}

// ── Budget & AbortController ──────────────────────────────────────

export interface RSIBudget {
  maxCandidatesPerCampaign: number
  maxConcurrentExperiments: number
  maxAutomaticPromotionsPerScopePerDay: number
  maxTaskContinuations: number
  maxCampaignCostUsd: number
}

function loadBudget(): RSIBudget {
  return {
    maxCandidatesPerCampaign: parseInt(process.env.MOMO_RSI_MAX_CANDIDATES || "3", 10),
    maxConcurrentExperiments: parseInt(process.env.MOMO_RSI_MAX_CONCURRENT || "1", 10),
    maxAutomaticPromotionsPerScopePerDay: parseInt(process.env.MOMO_RSI_MAX_PROMOTIONS_PER_DAY || "1", 10),
    maxTaskContinuations: parseInt(process.env.MOMO_RSI_MAX_CONTINUATIONS || "1", 10),
    maxCampaignCostUsd: parseFloat(process.env.MOMO_RSI_MAX_COST || "5"),
  }
}

function checkBudget(budget: RSIBudget, spentUsd: number): boolean {
  if (spentUsd >= budget.maxCampaignCostUsd) {
    console.warn(`[RSI] Budget exceeded: $${spentUsd.toFixed(2)} / $${budget.maxCampaignCostUsd}`)
    return false
  }
  return true
}

// ── Full RSI loop (momo loop command) ─────────────────────────────

export async function runRSILoop(): Promise<void> {
  console.warn("🔄 Starting RSI Loop (Ctrl+C to stop, touch ~/.momo/STOP to halt)")

  const abortController = new AbortController()
  const stopPoller = setInterval(() => {
    if (isStopped()) {
      abortController.abort()
      clearInterval(stopPoller)
    }
  }, 1000)

  const budget = loadBudget()
  let spentUsd = 0

  try {
    while (!abortController.signal.aborted) {
      if (!checkBudget(budget, spentUsd)) break

      await r1Optimize()

      // R2 runs less frequently
      if (Math.random() < 0.1) {
        await r2Optimize()
      }

      // R3 runs rarely
      if (Math.random() < 0.01) {
        await r3Propose()
      }

      // Sleep with abort support
      await new Promise((r) => setTimeout(r, 60_000))
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("🛑 RSI Loop aborted")
    } else {
      throw err
    }
  } finally {
    clearInterval(stopPoller)
  }

  console.warn("🛑 RSI Loop halted")
}

// ── Helpers ───────────────────────────────────────────────────────

interface MetricRecord {
  timestamp: string
  outcome: string
  latencyMs: number
}

function readMetrics(): MetricRecord[] {
  try {
    const lines = fs.readFileSync(RSI_LOG, "utf-8").trim().split("\n")
    return lines
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
      .filter((m) => m.timestamp && m.outcome)
  } catch {
    return []
  }
}
