/**
 * ExperienceStore — persistence layer for the fast evolution loop.
 *
 * Manages reading and writing of tactics, cases, and the audit ledger
 * to `~/.momo/experience/`. All operations are effectful and composable
 * via the Effect framework.
 *
 * Disk layout:
 * ```
 * ~/.momo/experience/
 *   tactics.json   — Tactic library (array of Tactic objects)
 *   cases.json     — Successful/failed cases (array of Case objects)
 *   ledger.jsonl   — Append-only audit log (one JSON object per line)
 * ```
 *
 * The store uses JSON for structured data (tactics, cases) and JSONL
 * for the append-only ledger. All writes are atomic (write to temp file,
 * then rename) to prevent corruption on crash.
 *
 * @module experience/store
 */
import { Effect, Layer } from "effect";
import type { Tactic, TacticStatus } from "./tactic";
import type { Case } from "./case";
import type { LedgerEntry } from "./ledger";
declare const ExperienceStore_base: Effect.Service.Class<ExperienceStore, "experience/Store", {
    readonly effect: Effect.Effect<{
        readonly loadTactics: () => Effect.Effect<ReadonlyArray<Tactic>, Error>;
        readonly saveTactics: (tactics: ReadonlyArray<Tactic>) => Effect.Effect<void, Error>;
        readonly getCachedTactics: () => Effect.Effect<ReadonlyArray<Tactic>>;
        readonly findTactic: (id: string) => Effect.Effect<Tactic | null>;
        readonly updateTacticStatus: (id: string, status: TacticStatus) => Effect.Effect<boolean, Error>;
        readonly loadCases: () => Effect.Effect<ReadonlyArray<Case>, Error>;
        readonly saveCases: (cases: ReadonlyArray<Case>) => Effect.Effect<void, Error>;
        readonly getCachedCases: () => Effect.Effect<ReadonlyArray<Case>>;
        readonly appendCase: (newCase: Case) => Effect.Effect<void, Error>;
        readonly appendLedger: (entry: LedgerEntry) => Effect.Effect<void, Error>;
        readonly appendLedgerBatch: (entries: ReadonlyArray<LedgerEntry>) => Effect.Effect<void, Error>;
        readonly loadLedger: () => Effect.Effect<ReadonlyArray<LedgerEntry>, Error>;
        readonly initialize: () => Effect.Effect<{
            tactics: ReadonlyArray<Tactic>;
            cases: ReadonlyArray<Case>;
            ledger: ReadonlyArray<LedgerEntry>;
        }, Error>;
        readonly getPaths: () => Effect.Effect<{
            dir: string;
            tactics: string;
            cases: string;
            ledger: string;
        }>;
    }, never, never>;
    readonly dependencies: readonly [];
}>;
/**
 * Persistence service for the experience fast loop.
 *
 * Provides methods to load and save tactics, cases, and ledger entries.
 * All operations are atomic and composable within Effect workflows.
 *
 * Usage:
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const store = yield* ExperienceStore
 *   const tactics = yield* store.loadTactics()
 *   // ... modify tactics ...
 *   yield* store.saveTactics(updatedTactics)
 * })
 * ```
 */
export declare class ExperienceStore extends ExperienceStore_base {
}
/** Default live layer for the ExperienceStore service. */
export declare const ExperienceStoreLive: Layer.Layer<ExperienceStore, never, never>;
export {};
//# sourceMappingURL=store.d.ts.map