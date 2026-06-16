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
// ---------------------------------------------------------------------------
// JSONL formatting
// ---------------------------------------------------------------------------
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
export function formatLedgerEntry(entry) {
    // Build object with consistent field ordering: kind, timestamp, then rest
    const base = {
        kind: entry.kind,
        timestamp: entry.timestamp,
    };
    switch (entry.kind) {
        case "observe":
            return JSON.stringify({
                ...base,
                sessionId: entry.sessionId,
                signalCount: entry.signalCount,
            });
        case "distill":
            return JSON.stringify({
                ...base,
                tacticIds: entry.tacticIds,
                summary: entry.summary,
            });
        case "inject":
            return JSON.stringify({
                ...base,
                sessionId: entry.sessionId,
                tacticIds: entry.tacticIds,
            });
        case "solidify":
            return JSON.stringify({
                ...base,
                caseId: entry.caseId,
                tacticId: entry.tacticId,
                verdict: entry.verdict,
            });
        case "promote":
            return JSON.stringify({
                ...base,
                tacticId: entry.tacticId,
                from: entry.from,
                to: entry.to,
            });
        case "retire":
            return JSON.stringify({
                ...base,
                tacticId: entry.tacticId,
                reason: entry.reason,
            });
        case "bridge":
            return JSON.stringify({
                ...base,
                caseIds: entry.caseIds,
                target: entry.target,
            });
        default: {
            // Exhaustiveness check — should never reach here
            const _exhaustive = entry;
            void _exhaustive;
            return JSON.stringify(base);
        }
    }
}
/**
 * Parse a JSONL line back into a LedgerEntry.
 *
 * Validates the `kind` field and returns `null` for unparseable lines.
 * This is the inverse of `formatLedgerEntry`.
 *
 * @param line - A single JSONL line (may include trailing newline)
 * @returns Parsed LedgerEntry or null if invalid
 */
export function parseLedgerEntry(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed.kind || !parsed.timestamp)
            return null;
        // Basic validation — ensure required fields exist for each kind
        switch (parsed.kind) {
            case "observe": {
                const o = parsed;
                if (typeof o.signalCount !== "number")
                    return null;
                return o;
            }
            case "distill": {
                const d = parsed;
                if (!Array.isArray(d.tacticIds))
                    return null;
                return d;
            }
            case "inject": {
                const i = parsed;
                if (!i.sessionId || !Array.isArray(i.tacticIds))
                    return null;
                return i;
            }
            case "solidify": {
                const s = parsed;
                if (!s.caseId || !s.tacticId || !s.verdict)
                    return null;
                return s;
            }
            case "promote": {
                const p = parsed;
                if (!p.tacticId || !p.from || !p.to)
                    return null;
                return p;
            }
            case "retire": {
                const r = parsed;
                if (!r.tacticId || !r.reason)
                    return null;
                return r;
            }
            case "bridge": {
                const b = parsed;
                if (!Array.isArray(b.caseIds) || b.target !== "curriculum")
                    return null;
                return b;
            }
            default:
                return null;
        }
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=ledger.js.map