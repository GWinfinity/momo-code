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
import { Effect, Ref } from "effect";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { formatLedgerEntry, parseLedgerEntry } from "./ledger.js";
// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
/** Subdirectory within ~/.momo for experience data. */
const EXPERIENCE_DIR = "experience";
/** Filename for the tactics library. */
const TACTICS_FILE = "tactics.json";
/** Filename for case records. */
const CASES_FILE = "cases.json";
/** Filename for the append-only audit ledger. */
const LEDGER_FILE = "ledger.jsonl";
/**
 * Get the experience data directory path.
 * Resolves to `~/.momo/experience/`.
 */
function getExperienceDir() {
    const homeDir = process.env.MOMO_CONFIG_DIR || path.join(os.homedir(), ".momo");
    return path.join(homeDir, EXPERIENCE_DIR);
}
/**
 * Get the full path for a named file in the experience directory.
 */
function getFilePath(filename) {
    return path.join(getExperienceDir(), filename);
}
// ---------------------------------------------------------------------------
// Atomic file operations
// ---------------------------------------------------------------------------
/**
 * Ensure the experience directory exists.
 * Creates parent directories recursively if needed.
 */
function ensureDir() {
    return Effect.try({
        try: () => {
            const dir = getExperienceDir();
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        },
        catch: (error) => new Error(`Failed to create experience directory: ${error instanceof Error ? error.message : String(error)}`),
    });
}
/**
 * Atomically write JSON data to a file.
 * Writes to a temp file first, then renames for atomicity.
 */
function writeJsonFile(filename, data) {
    return Effect.gen(function* () {
        yield* ensureDir();
        const filePath = getFilePath(filename);
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        const json = JSON.stringify(data, null, 2);
        yield* Effect.try({
            try: () => {
                fs.writeFileSync(tempPath, json, "utf-8");
                fs.renameSync(tempPath, filePath);
            },
            catch: (error) => {
                // Clean up temp file on failure
                try {
                    fs.unlinkSync(tempPath);
                }
                catch {
                    /* ignore cleanup errors */
                }
                return new Error(`Failed to write ${filename}: ${error instanceof Error ? error.message : String(error)}`);
            },
        });
    });
}
/**
 * Read and parse JSON from a file.
 * Returns default value if file does not exist.
 */
function readJsonFile(filename, defaultValue) {
    return Effect.try({
        try: () => {
            const filePath = getFilePath(filename);
            if (!fs.existsSync(filePath)) {
                return defaultValue;
            }
            const content = fs.readFileSync(filePath, "utf-8");
            if (!content.trim()) {
                return defaultValue;
            }
            return JSON.parse(content);
        },
        catch: (error) => new Error(`Failed to read ${filename}: ${error instanceof Error ? error.message : String(error)}`),
    });
}
// ---------------------------------------------------------------------------
// ExperienceStore service
// ---------------------------------------------------------------------------
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
export class ExperienceStore extends Effect.Service()("experience/Store", {
    effect: Effect.gen(function* () {
        // In-memory caches for fast access
        const tacticsRef = yield* Ref.make([]);
        const casesRef = yield* Ref.make([]);
        const ledgerLoadedRef = yield* Ref.make(false);
        // -------------------------------------------------------------------
        // Tactics
        // -------------------------------------------------------------------
        /**
         * Load all tactics from disk into the in-memory cache.
         *
         * Reads `~/.momo/experience/tactics.json`. If the file does not
         * exist, returns an empty array and initializes the cache.
         *
         * @returns Array of all stored tactics
         */
        const loadTactics = () => Effect.gen(function* () {
            const data = yield* readJsonFile(TACTICS_FILE, { tactics: [] });
            const tactics = data.tactics ?? [];
            yield* Ref.set(tacticsRef, tactics);
            yield* Effect.log(`[ExperienceStore] Loaded ${tactics.length} tactics`);
            return tactics;
        });
        /**
         * Save tactics to disk.
         *
         * Atomically writes `~/.momo/experience/tactics.json` and
         * updates the in-memory cache.
         *
         * @param tactics - Array of tactics to persist
         */
        const saveTactics = (tactics) => Effect.gen(function* () {
            yield* writeJsonFile(TACTICS_FILE, { tactics: [...tactics] });
            yield* Ref.set(tacticsRef, tactics);
            yield* Effect.log(`[ExperienceStore] Saved ${tactics.length} tactics`);
        });
        /**
         * Get tactics from the in-memory cache without reading disk.
         *
         * Returns cached data from the last `loadTactics()` call.
         * Use this for read-heavy operations where staleness is acceptable.
         */
        const getCachedTactics = () => Ref.get(tacticsRef);
        /**
         * Find a tactic by ID.
         *
         * Searches the in-memory cache. Call `loadTactics()` first to
         * ensure the cache is populated.
         *
         * @param id - Tactic ID to search for
         * @returns The tactic if found, null otherwise
         */
        const findTactic = (id) => Effect.gen(function* () {
            const tactics = yield* Ref.get(tacticsRef);
            const found = tactics.find((t) => t.id === id);
            return found ?? null;
        });
        /**
         * Update a single tactic's status.
         *
         * Modifies the in-memory cache and persists to disk.
         *
         * @param id - Tactic ID to update
         * @param status - New status value
         * @returns `true` if the tactic was found and updated
         */
        const updateTacticStatus = (id, status) => Effect.gen(function* () {
            const tactics = yield* Ref.get(tacticsRef);
            const index = tactics.findIndex((t) => t.id === id);
            if (index === -1) {
                yield* Effect.logWarning(`[ExperienceStore] Tactic not found for status update: ${id}`);
                return false;
            }
            const updated = tactics.map((t, i) => i === index ? { ...t, status } : t);
            yield* saveTactics(updated);
            yield* Effect.log(`[ExperienceStore] Updated tactic ${id} status → ${status}`);
            return true;
        });
        // -------------------------------------------------------------------
        // Cases
        // -------------------------------------------------------------------
        /**
         * Load all cases from disk into the in-memory cache.
         *
         * Reads `~/.momo/experience/cases.json`. If the file does not
         * exist, returns an empty array.
         *
         * @returns Array of all stored cases
         */
        const loadCases = () => Effect.gen(function* () {
            const data = yield* readJsonFile(CASES_FILE, {
                cases: [],
            });
            const cases = data.cases ?? [];
            yield* Ref.set(casesRef, cases);
            yield* Effect.log(`[ExperienceStore] Loaded ${cases.length} cases`);
            return cases;
        });
        /**
         * Save cases to disk.
         *
         * Atomically writes `~/.momo/experience/cases.json` and
         * updates the in-memory cache.
         *
         * @param cases - Array of cases to persist
         */
        const saveCases = (cases) => Effect.gen(function* () {
            yield* writeJsonFile(CASES_FILE, { cases: [...cases] });
            yield* Ref.set(casesRef, cases);
            yield* Effect.log(`[ExperienceStore] Saved ${cases.length} cases`);
        });
        /**
         * Append a single case to the store.
         *
         * Loads existing cases, appends the new one, and saves.
         * More efficient bulk append is available via `saveCases`.
         *
         * @param newCase - Case to append
         */
        const appendCase = (newCase) => Effect.gen(function* () {
            const existing = yield* loadCases();
            const updated = [...existing, newCase];
            yield* saveCases(updated);
        });
        /**
         * Get cases from the in-memory cache without reading disk.
         */
        const getCachedCases = () => Ref.get(casesRef);
        // -------------------------------------------------------------------
        // Ledger (append-only JSONL)
        // -------------------------------------------------------------------
        /**
         * Append a single entry to the audit ledger.
         *
         * Writes to `~/.momo/experience/ledger.jsonl` in append-only
         * fashion. Each entry is a single line of JSON. This operation
         * is atomic at the OS level for single lines.
         *
         * @param entry - Ledger entry to append
         */
        const appendLedger = (entry) => Effect.gen(function* () {
            yield* ensureDir();
            const filePath = getFilePath(LEDGER_FILE);
            const line = formatLedgerEntry(entry) + "\n";
            yield* Effect.try({
                try: () => {
                    fs.appendFileSync(filePath, line, "utf-8");
                },
                catch: (error) => new Error(`Failed to append ledger entry: ${error instanceof Error ? error.message : String(error)}`),
            });
            yield* Effect.log(`[ExperienceStore] Appended ledger entry: ${entry.kind}`);
        });
        /**
         * Append multiple entries to the audit ledger.
         *
         * Batches writes for efficiency. All entries share one
         * timestamp granularity (same second-level precision).
         *
         * @param entries - Ledger entries to append
         */
        const appendLedgerBatch = (entries) => Effect.gen(function* () {
            if (entries.length === 0)
                return;
            yield* ensureDir();
            const filePath = getFilePath(LEDGER_FILE);
            const lines = entries.map((e) => formatLedgerEntry(e) + "\n").join("");
            yield* Effect.try({
                try: () => {
                    fs.appendFileSync(filePath, lines, "utf-8");
                },
                catch: (error) => new Error(`Failed to append ledger batch: ${error instanceof Error ? error.message : String(error)}`),
            });
            yield* Effect.log(`[ExperienceStore] Appended ${entries.length} ledger entries`);
        });
        /**
         * Load all ledger entries from disk.
         *
         * Parses `~/.momo/experience/ledger.jsonl` line by line.
         * Invalid lines are skipped with a warning. Returns entries
         * in chronological order (as stored).
         *
         * @returns Array of parsed ledger entries
         */
        const loadLedger = () => Effect.gen(function* () {
            const filePath = getFilePath(LEDGER_FILE);
            const exists = yield* Effect.sync(() => fs.existsSync(filePath));
            if (!exists) {
                yield* Ref.set(ledgerLoadedRef, true);
                return [];
            }
            const content = yield* Effect.try({
                try: () => fs.readFileSync(filePath, "utf-8"),
                catch: (error) => new Error(`Failed to read ledger: ${error instanceof Error ? error.message : String(error)}`),
            });
            const lines = content.split("\n").filter((line) => line.trim());
            const entries = [];
            let skipped = 0;
            for (const line of lines) {
                const entry = parseLedgerEntry(line);
                if (entry) {
                    entries.push(entry);
                }
                else {
                    skipped++;
                }
            }
            if (skipped > 0) {
                yield* Effect.logWarning(`[ExperienceStore] Skipped ${skipped} invalid ledger lines`);
            }
            yield* Ref.set(ledgerLoadedRef, true);
            yield* Effect.log(`[ExperienceStore] Loaded ${entries.length} ledger entries`);
            return entries;
        });
        // -------------------------------------------------------------------
        // Bulk operations
        // -------------------------------------------------------------------
        /**
         * Initialize the store by loading all data from disk.
         *
         * Call this at startup to populate in-memory caches.
         * Loads tactics, cases, and the ledger in parallel.
         */
        const initialize = () => Effect.gen(function* () {
            yield* Effect.log("[ExperienceStore] Initializing...");
            const [tactics, cases, ledger] = yield* Effect.all([loadTactics(), loadCases(), loadLedger()], { concurrency: 3 });
            yield* Effect.log(`[ExperienceStore] Ready: ${tactics.length} tactics, ${cases.length} cases, ${ledger.length} ledger entries`);
            return { tactics, cases, ledger };
        });
        /**
         * Get the file paths managed by this store.
         * Useful for backup, migration, or diagnostics.
         */
        const getPaths = () => Effect.sync(() => ({
            dir: getExperienceDir(),
            tactics: getFilePath(TACTICS_FILE),
            cases: getFilePath(CASES_FILE),
            ledger: getFilePath(LEDGER_FILE),
        }));
        // -------------------------------------------------------------------
        // Return service API
        // -------------------------------------------------------------------
        return {
            // Tactics
            loadTactics,
            saveTactics,
            getCachedTactics,
            findTactic,
            updateTacticStatus,
            // Cases
            loadCases,
            saveCases,
            getCachedCases,
            appendCase,
            // Ledger
            appendLedger,
            appendLedgerBatch,
            loadLedger,
            // Bulk
            initialize,
            getPaths,
        };
    }),
    dependencies: [],
}) {
}
/** Default live layer for the ExperienceStore service. */
export const ExperienceStoreLive = ExperienceStore.Default;
//# sourceMappingURL=store.js.map