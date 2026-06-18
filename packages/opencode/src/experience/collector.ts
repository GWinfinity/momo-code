/**
 * Collector — Observation phase of the fast evolution loop.
 *
 * Extracts signals from session DB + tool call events, computes
 * verdict v (pass/fail/partial) from objective signal outcomes.
 *
 * Reference: KEP §44.1 — Observe
 */
import { Effect } from "effect"
import type { Signal, SignalType, Verdict } from "../evolve/signals"
import type { SignalPattern } from "./signals"

// ---------------------------------------------------------------------------
// Re-export signal types from evolve/ (shared definition)
// ---------------------------------------------------------------------------

export type { Signal, SignalType, Verdict } from "../evolve/signals"

// ---------------------------------------------------------------------------
// Session observation result
// ---------------------------------------------------------------------------

/** Raw observation extracted from a completed session. */
export interface SessionObservation {
  readonly sessionId: string
  readonly signals: ReadonlyArray<Signal>
  readonly verdict: Verdict
  readonly durationMs: number
  readonly toolCallCount: number
  readonly timestamp: number
}

// ---------------------------------------------------------------------------
// Verdict computation (objective, signal-based)
// ---------------------------------------------------------------------------

/**
 * Compute overall verdict from a set of signals.
 * Weighted majority vote: pass signals vs fail signals.
 *
 * @param signals   — Extracted session signals (from evolve/signals.ts)
 * @param weights   — Optional per-signal weights (default: uniform)
 * @returns         — "pass" | "fail" | "partial"
 */
export function computeVerdict(
  signals: ReadonlyArray<Signal>,
  weights?: ReadonlyArray<number>,
): Verdict {
  if (signals.length === 0) return "partial"

  let passScore = 0
  let failScore = 0

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i]
    const weight = weights?.[i] ?? 1
    if (s.verdict === "pass") passScore += s.confidence * weight
    else if (s.verdict === "fail") failScore += s.confidence * weight
    // "partial" verdicts contribute to neither score
  }

  const total = passScore + failScore
  if (total === 0) return "partial"

  const ratio = passScore / total
  if (ratio >= 0.7) return "pass"
  if (ratio <= 0.3) return "fail"
  return "partial"
}

// ---------------------------------------------------------------------------
// Signal → pattern matching
// ---------------------------------------------------------------------------

/**
 * Check if a signal matches a trigger pattern.
 * Used by selector.ts to find candidate tactics for a task.
 */
export function signalMatchesPattern(
  signal: Signal,
  pattern: SignalPattern,
): boolean {
  // Type match
  if (!pattern.types.includes(signal.type)) return false

  // Confidence threshold
  if (signal.confidence < pattern.minConfidence) return false

  // Context match (optional keyword filter)
  if (pattern.matchContext) {
    const ctx = JSON.stringify(signal.metadata).toLowerCase()
    if (!ctx.includes(pattern.matchContext.toLowerCase())) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Collector service
// ---------------------------------------------------------------------------

/**
 * Collector — extracts signals from sessions and computes verdicts.
 *
 * In production, reads from session DB (MOMO_DB). For now,
 * works with Signal arrays passed directly.
 */
export class Collector extends Effect.Service<Collector>()("experience/Collector", {
  effect: Effect.gen(function* () {

    /**
     * Observe a session given its signals.
     * In production, this would read from MOMO_DB.
     */
    const fromSignals = (
      sessionId: string,
      signals: ReadonlyArray<Signal>,
    ): Effect.Effect<SessionObservation, never, never> =>
      Effect.sync(() => ({
        sessionId,
        signals,
        verdict: computeVerdict(signals),
        durationMs: 0,  // Would come from session metadata
        toolCallCount: signals.length,
        timestamp: Date.now(),
      }))

    /**
     * Observe from a single tool call result.
     */
    const fromToolResult = (
      sessionId: string,
      toolName: string,
      exitCode: number,
    ): Effect.Effect<SessionObservation, never, never> =>
      Effect.sync(() => {
        const type: SignalType = exitCode === 0
          ? "test-pass"
          : toolName === "bash"
            ? "test-fail"
            : "compile-error"

        const signal: Signal = {
          sessionId,
          timestamp: new Date(),
          type,
          verdict: exitCode === 0 ? "pass" : "fail",
          confidence: 0.95,
          metadata: { toolName, exitCode },
        }

        return {
          sessionId,
          signals: [signal],
          verdict: signal.verdict,
          durationMs: 0,
          toolCallCount: 1,
          timestamp: Date.now(),
        }
      })

    /**
     * Aggregate multiple observations into a single verdict.
     */
    const aggregate = (
      observations: ReadonlyArray<SessionObservation>,
    ): Effect.Effect<{
      verdict: Verdict
      totalSignals: number
      passCount: number
      failCount: number
    }, never, never> =>
      Effect.sync(() => {
        let passCount = 0
        let failCount = 0
        let totalSignals = 0

        for (const obs of observations) {
          totalSignals += obs.signals.length
          for (const s of obs.signals) {
            if (s.verdict === "pass") passCount++
            else if (s.verdict === "fail") failCount++
          }
        }

        const total = passCount + failCount
        let verdict: Verdict = "partial"
        if (total > 0) {
          const ratio = passCount / total
          if (ratio >= 0.7) verdict = "pass"
          else if (ratio <= 0.3) verdict = "fail"
        }

        return { verdict, totalSignals, passCount, failCount }
      })

    return { fromSignals, fromToolResult, aggregate } as const
  }),
  dependencies: [],
}) {}

export const CollectorLive = Collector.Default
