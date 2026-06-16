/**
 * Ledger — append-only audit log for the experience system.
 *
 * All significant operations in the experience loop are recorded as
 * immutable ledger entries. This provides:
 *
 * - **Auditability**: Complete history of what the system did and when
 * - **Reproducibility**: Replay the sequence of observations, distillations,
 *   injections, and solidifications
 * - **Debugging**: Trace the lifecycle of any tactic or case
 * - **Bridge to slow loop**: Entries of kind `bridge` mark when cases
 *   are promoted to curriculum for fine-tuning
 *
 * The ledger is stored in JSON Lines (JSONL) format — one JSON object
 * per line, append-only, no modifications.
 *
 * @module experience/ledger
 */
import type { TacticStatus } from "./tactic";
/**
 * A signal observation event — raw signals captured from a session.
 *
 * Recorded when the observer module extracts signals from a completed
 * or in-progress session. `signalCount` tells how many distinct signals
 * were observed (not the full signal data, which stays in session storage).
 */
export interface ObserveEntry {
    readonly kind: "observe";
    readonly sessionId: string;
    readonly signalCount: number;
    readonly timestamp: string;
}
/**
 * A distillation event — new tactics extracted from observed signals.
 *
 * Recorded when the distiller processes signals and produces new or
 * updated tactics. `tacticIds` lists the tactics that were created or
 * modified, and `summary` provides a human-readable description.
 */
export interface DistillEntry {
    readonly kind: "distill";
    readonly tacticIds: string[];
    readonly summary: string;
    readonly timestamp: string;
}
/**
 * An injection event — tactics injected into a session's system prompt.
 *
 * Recorded when the injector selects matching tactics and injects them
 * into the prompt context. Links the session to the tactics that were
 * applied.
 */
export interface InjectEntry {
    readonly kind: "inject";
    readonly sessionId: string;
    readonly tacticIds: string[];
    readonly timestamp: string;
}
/**
 * A solidification event — case outcome recorded, tactic stats updated.
 *
 * Recorded when a case completes and the system updates tactic
 * statistics based on the verdict. This is the primary feedback loop
 * that drives Bayesian learning.
 */
export interface SolidifyEntry {
    readonly kind: "solidify";
    readonly caseId: string;
    readonly tacticId: string;
    readonly verdict: string;
    readonly timestamp: string;
}
/**
 * A promotion event — tactic status advanced.
 *
 * Recorded when a tactic transitions between lifecycle states
 * (draft → active → promoted, or reverse). Tracks the old and new
 * status for audit purposes.
 */
export interface PromoteEntry {
    readonly kind: "promote";
    readonly tacticId: string;
    readonly from: TacticStatus;
    readonly to: TacticStatus;
    readonly timestamp: string;
}
/**
 * A retirement event — tactic removed from active use.
 *
 * Recorded when a tactic is retired due to poor performance,
 * being superseded, or manual curation. The `reason` field
 * explains why.
 */
export interface RetireEntry {
    readonly kind: "retire";
    readonly tacticId: string;
    readonly reason: string;
    readonly timestamp: string;
}
/**
 * A bridge event — cases promoted to curriculum for the slow loop.
 *
 * Recorded when high-quality cases are selected and sent to the
 * fine-tuning pipeline. Marks the boundary between fast loop
 * (experience) and slow loop (fine-tune).
 */
export interface BridgeEntry {
    readonly kind: "bridge";
    readonly caseIds: string[];
    readonly target: "curriculum";
    readonly timestamp: string;
}
/**
 * Discriminated union of all ledger entry types.
 *
 * Each entry has a `kind` field for type narrowing and a `timestamp`
 * field for chronological ordering. Entries are immutable — once
 * written, they are never modified.
 */
export type LedgerEntry = ObserveEntry | DistillEntry | InjectEntry | SolidifyEntry | PromoteEntry | RetireEntry | BridgeEntry;
/**
 * Format a ledger entry as a JSON Lines (JSONL) string.
 *
 * Returns a single line of compact JSON with no trailing newline.
 * The output is designed for appending to a `.jsonl` file — callers
 * should add `\n` when writing to disk.
 *
 * Fields are ordered consistently: `kind` first, then `timestamp`,
 * then kind-specific fields. This makes the ledger human-readable
 * when scanning with `tail` or `grep`.
 *
 * @param entry - The ledger entry to format
 * @returns Compact JSON string (single line, no trailing newline)
 *
 * @example
 * ```typescript
 * const entry: LedgerEntry = {
 *   kind: "observe",
 *   sessionId: "sess_001",
 *   signalCount: 3,
 *   timestamp: "2024-01-15T10:30:00.000Z",
 * }
 * formatLedgerEntry(entry)
 * // → '{"kind":"observe","timestamp":"2024-01-15T10:30:00.000Z","sessionId":"sess_001","signalCount":3}'
 * ```
 */
export declare function formatLedgerEntry(entry: LedgerEntry): string;
/**
 * Parse a JSONL line back into a LedgerEntry.
 *
 * Validates the `kind` field and returns `null` for unparseable lines.
 * This is the inverse of `formatLedgerEntry`.
 *
 * @param line - A single JSONL line (may include trailing newline)
 * @returns Parsed LedgerEntry or null if invalid
 */
export declare function parseLedgerEntry(line: string): LedgerEntry | null;
//# sourceMappingURL=ledger.d.ts.map