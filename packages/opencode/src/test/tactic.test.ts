/**
 * Tests for the tactic module (experience fast loop).
 *
 * Covers:
 * - Bayesian statistics (winRate, thompsonSample, ucbScore)
 * - Status transition predicates (canActivate, canPromote, shouldRetire)
 * - ID generation (generateTacticId)
 * - Tactic type definitions
 */

import { describe, it } from "node:test"
import assert from "node:assert"
import {
  type Tactic,
  type TacticStats,
  type TacticScope,
  type TacticIntent,
  type TacticStatus,
  winRate,
  thompsonSample,
  ucbScore,
  canActivate,
  canPromote,
  shouldRetire,
  generateTacticId,
} from "../experience/tactic"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<TacticStats> = {}): TacticStats {
  return {
    wins: 0,
    losses: 0,
    alpha: 1,
    beta: 1,
    lastUsed: new Date().toISOString(),
    uses: 0,
    ...overrides,
  }
}

function makeTactic(overrides: Partial<Tactic> = {}): Tactic {
  const scope: TacticScope = "global"
  const title = overrides.title || "Test Tactic"
  return {
    id: generateTacticId(scope, title),
    scope,
    intent: "convention",
    title,
    triggers: [],
    preconditions: [],
    steps: [],
    guardrails: { maxFiles: 10, forbiddenPaths: [".git", "node_modules"], smallestReversible: true },
    checks: [],
    stats: makeStats(),
    status: "draft",
    provenance: { fromSessions: [], createdAt: new Date().toISOString(), scrubbed: true },
    ...overrides,
  } as Tactic
}

describe("tactic", () => {
  // ---------------------------------------------------------------------------
  // Bayesian statistics
  // ---------------------------------------------------------------------------

  describe("winRate", () => {
    it("returns 0.5 for uniform prior (alpha=1, beta=1)", () => {
      const stats = makeStats()
      assert.strictEqual(winRate(stats), 0.5)
    })

    it("calculates correct win rate from alpha/beta", () => {
      const stats = makeStats({ alpha: 9, beta: 3 })
      assert.strictEqual(winRate(stats), 9 / 12)
    })

    it("handles zero sum gracefully", () => {
      const stats = makeStats({ alpha: 0, beta: 0 })
      assert.strictEqual(winRate(stats), 0.5)
    })
  })

  describe("thompsonSample", () => {
    it("returns a number between 0 and 1", () => {
      const stats = makeStats({ alpha: 6, beta: 4 })
      const sample = thompsonSample(stats)
      assert.strictEqual(typeof sample, "number")
      assert.ok(sample >= 0 && sample <= 1, `sample ${sample} should be in [0, 1]`)
    })

    it("returns higher values for better-performing tactics on average", () => {
      const goodStats = makeStats({ alpha: 91, beta: 11, uses: 100 })
      const badStats = makeStats({ alpha: 11, beta: 91, uses: 100 })

      let goodSum = 0
      let badSum = 0
      const n = 100
      for (let i = 0; i < n; i++) {
        goodSum += thompsonSample(goodStats)
        badSum += thompsonSample(badStats)
      }

      assert.ok(
        goodSum / n > badSum / n,
        `Good tactic should have higher average sample (${goodSum / n} vs ${badSum / n})`,
      )
    })
  })

  describe("ucbScore", () => {
    it("returns infinity for unused tactics", () => {
      const stats = makeStats({ uses: 0 })
      assert.strictEqual(ucbScore(stats, 100), Number.POSITIVE_INFINITY)
    })

    it("increases with higher win rate", () => {
      const lowStats = makeStats({ alpha: 2, beta: 10, uses: 10 })
      const highStats = makeStats({ alpha: 10, beta: 2, uses: 10 })

      const totalUses = 20
      const lowScore = ucbScore(lowStats, totalUses)
      const highScore = ucbScore(highStats, totalUses)

      assert.ok(highScore > lowScore, `High win rate should have higher UCB score`)
    })
  })

  // ---------------------------------------------------------------------------
  // Status transition predicates
  // ---------------------------------------------------------------------------

  describe("canActivate", () => {
    it("allows activation when win rate >= 0.6", () => {
      const tactic = makeTactic({
        status: "draft",
        stats: makeStats({ alpha: 7, beta: 3, uses: 8 }),
      })
      assert.strictEqual(canActivate(tactic), true)
    })

    it("rejects activation when win rate < 0.6", () => {
      const tactic = makeTactic({
        status: "draft",
        stats: makeStats({ alpha: 2, beta: 8, uses: 8 }),
      })
      assert.strictEqual(canActivate(tactic), false)
    })

    it("rejects activation for non-draft tactics", () => {
      const tactic = makeTactic({
        status: "active",
        stats: makeStats({ alpha: 9, beta: 1, uses: 8 }),
      })
      assert.strictEqual(canActivate(tactic), false)
    })
  })

  describe("canPromote", () => {
    it("allows promotion with high win rate and enough uses", () => {
      const tactic = makeTactic({
        status: "active",
        stats: makeStats({ alpha: 9, beta: 1, uses: 10 }),
      })
      assert.strictEqual(canPromote(tactic), true)
    })

    it("rejects promotion with insufficient uses", () => {
      const tactic = makeTactic({
        status: "active",
        stats: makeStats({ alpha: 9, beta: 1, uses: 2 }),
      })
      assert.strictEqual(canPromote(tactic), false)
    })

    it("rejects promotion for non-active tactics", () => {
      const tactic = makeTactic({
        status: "draft",
        stats: makeStats({ alpha: 9, beta: 1, uses: 10 }),
      })
      assert.strictEqual(canPromote(tactic), false)
    })
  })

  describe("shouldRetire", () => {
    it("suggests retirement when win rate <= 0.3", () => {
      const tactic = makeTactic({
        status: "active",
        stats: makeStats({ alpha: 2, beta: 8, uses: 10 }),
      })
      assert.strictEqual(shouldRetire(tactic), true)
    })

    it("protects promoted tactics from retirement", () => {
      const tactic = makeTactic({
        status: "promoted",
        stats: makeStats({ alpha: 1, beta: 9, uses: 10 }),
      })
      assert.strictEqual(shouldRetire(tactic), false)
    })

    it("rejects retirement with insufficient uses", () => {
      const tactic = makeTactic({
        status: "active",
        stats: makeStats({ alpha: 1, beta: 9, uses: 2 }),
      })
      assert.strictEqual(shouldRetire(tactic), false)
    })
  })

  // ---------------------------------------------------------------------------
  // ID generation
  // ---------------------------------------------------------------------------

  describe("generateTacticId", () => {
    it("generates IDs with correct prefix", () => {
      const id = generateTacticId("global", "test-title")
      assert.ok(id.startsWith("tac_global_"))
    })

    it("generates different IDs for different inputs", () => {
      const id1 = generateTacticId("global", "title-a")
      const id2 = generateTacticId("global", "title-b")
      assert.notStrictEqual(id1, id2)
    })

    it("sanitizes colons in scope", () => {
      const id = generateTacticId("lang:typescript", "strict-mode")
      assert.ok(id.startsWith("tac_lang-typescript_"), `ID was: ${id}`)
    })

    it("is deterministic for same inputs", () => {
      const id1 = generateTacticId("repo", "fix-memory-leak")
      const id2 = generateTacticId("repo", "fix-memory-leak")
      assert.strictEqual(id1, id2)
    })
  })
})
