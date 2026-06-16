/**
 * Store — Training job state, datasets, checkpoint metadata, MCGS graph persistence.
 *
 * Handles persistence of:
 * - Training jobs (status, checkpoints, results)
 * - MCGS graph state (nodes, scores, parent-child relationships)
 * - Session data for mining signals
 * - Evaluation history
 *
 * Reference: Pioneer Agent §2.7 — "Job state is persisted to survive
 * preemption and enable resume."
 */
import { Effect, Ref, Option } from "effect";
export class Store extends Effect.Service()("evolve/Store", {
    effect: Effect.gen(function* () {
        // In-memory refs — in production, these would be backed by SQLite/DuckDB
        const jobsRef = yield* Ref.make([]);
        const graphRef = yield* Ref.make(Option.none());
        const sessionsRef = yield* Ref.make([]);
        const checkpointsRef = yield* Ref.make([]);
        /**
         * Load recent sessions from the session DB.
         * Returns sessions with their messages and tool call results.
         */
        const recentSessions = (opts) => Effect.gen(function* () {
            yield* Effect.log(`[Store] Loading last ${opts.days} days of sessions (limit ${opts.limit})`);
            // In production: query MOMO_DB session store via SQL
            // SELECT s.id, s.created_at, m.role, m.content, t.tool, t.input, t.output, t.accepted, t.exit_code, t.retries
            // FROM sessions s
            // LEFT JOIN messages m ON m.session_id = s.id
            // LEFT JOIN tool_calls t ON t.session_id = s.id
            // WHERE s.created_at > datetime('now', '-${opts.days} days')
            // ORDER BY s.created_at DESC
            // LIMIT ${opts.limit}
            const allSessions = yield* Ref.get(sessionsRef);
            const cutoff = Date.now() - opts.days * 24 * 60 * 60 * 1000;
            const filtered = allSessions
                .filter((s) => s.createdAt > cutoff)
                .slice(0, opts.limit);
            yield* Effect.log(`[Store] Found ${filtered.length} sessions`);
            return filtered;
        });
        /**
         * Insert session records (for testing/demo purposes).
         */
        const insertSessions = (sessions) => Effect.gen(function* () {
            yield* Ref.update(sessionsRef, (existing) => [...existing, ...sessions]);
            yield* Effect.log(`[Store] Inserted ${sessions.length} sessions`);
        });
        /**
         * Get the most recently created training job.
         */
        const currentJob = () => Ref.get(jobsRef).pipe(Effect.map((jobs) => jobs.at(-1)));
        /**
         * Save a training job to the store.
         */
        const saveJob = (job) => Ref.update(jobsRef, (jobs) => [...jobs, job]);
        /**
         * Update an existing job's status.
         */
        const updateJob = (jobId, update) => Ref.update(jobsRef, (jobs) => jobs.map((j) => (j.id === jobId ? { ...j, ...update } : j)));
        /**
         * Get all jobs.
         */
        const allJobs = () => Ref.get(jobsRef);
        /**
         * Persist the MCGS graph state.
         */
        const saveGraph = (graph) => Ref.set(graphRef, Option.some(graph));
        /**
         * Load the persisted MCGS graph state.
         */
        const loadGraph = () => Ref.get(graphRef);
        /**
         * Save evaluation checkpoint results.
         */
        const saveCheckpoint = (checkpoint) => Ref.update(checkpointsRef, (cps) => [...cps, checkpoint]);
        /**
         * Load all evaluation checkpoint results.
         */
        const loadCheckpoints = () => Ref.get(checkpointsRef);
        /**
         * Save a dataset snapshot for reproducibility.
         */
        const saveDataset = (version, dataset) => Effect.sync(() => {
            // In production: write to .momo/datasets/{version}.jsonl
            const snapshot = {
                version,
                createdAt: new Date().toISOString(),
                count: dataset.length,
                slices: {
                    gold: dataset.filter((s) => s._tag === "gold").length,
                    hardNegative: dataset.filter((s) => s._tag === "hard-negative").length,
                    replay: dataset.filter((s) => s._tag === "replay").length,
                },
                samples: dataset,
            };
            return snapshot;
        });
        return {
            recentSessions,
            insertSessions,
            currentJob,
            saveJob,
            updateJob,
            allJobs,
            saveGraph,
            loadGraph,
            saveCheckpoint,
            loadCheckpoints,
            saveDataset,
        };
    }),
    dependencies: [],
}) {
}
export const StoreLive = Store.Default;
//# sourceMappingURL=store.js.map