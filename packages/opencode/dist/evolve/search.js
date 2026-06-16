/**
 * Monte Carlo Graph Search (MCGS) — Core search algorithm.
 *
 * Implements the four MCGS operators:
 * - EXPAND: Hypothesis-driven modification of D/H/S
 * - SCORE: Real training + evaluation (no surrogate)
 * - FUSE: Cross-branch fusion for exploration
 * - PRUNE: Remove low-utility branches
 *
 * Reference: Pioneer Agent §2.4 — "MCGS treats training pipeline
 * search as a graph problem with four operators."
 */
import { Effect, Ref } from "effect";
import { Option } from "effect";
/**
 * Search service — implements Monte Carlo Graph Search.
 *
 * The graph represents the search space of training pipelines π=(D,H,S).
 * Each node is a pipeline configuration; edges represent modifications.
 *
 * MCGS operators:
 * - SELECT: UCT-based node selection with time-decayed exploration
 * - EXPAND: Generate child nodes by modifying D, H, or S
 * - SCORE: Evaluate a node (handled by trainer/evaluator)
 * - FUSE: Cross-branch fusion for exploration beyond local optima
 * - PRUNE: Remove low-utility subtrees
 */
export class Search extends Effect.Service()("evolve/Search", {
    effect: Effect.gen(function* () {
        const graphRef = yield* Ref.make(Option.none());
        const stagnationRef = yield* Ref.make(0);
        const bestScoreRef = yield* Ref.make(0.0);
        const defaultOpts = {
            explorationConstant: 1.414, // sqrt(2), standard UCT value
            decayFactor: 0.95,
            maxDepth: 8,
            stagnationThreshold: 5,
        };
        /**
         * Initialize the MCGS graph with a root node.
         */
        const init = (opts) => Effect.gen(function* () {
            const rootId = `root-${Date.now()}`;
            const now = new Date();
            // Create root pipeline from base model
            const rootPipeline = {
                D: {
                    gold: [],
                    hardNegatives: [],
                    replay: [],
                    qualityConstraints: {
                        twoForOne: true,
                        labelBalance: true,
                        contextLengthMatch: true,
                        entityDiversity: true,
                        cotAnnotated: true,
                    },
                },
                H: {
                    baseModel: opts.root,
                    loraRank: 16,
                    learningRate: 2e-4,
                    batchSize: 4,
                    epochs: 3,
                    systemPrompt: "You are an expert coding assistant. Think step by step.",
                },
                S: {
                    format: "direct",
                    teacherModel: "gpt-4.1",
                    evalMethod: "pass@1",
                },
            };
            const rootNode = {
                id: rootId,
                pi: rootPipeline,
                score: Option.none(),
                parentId: Option.none(),
                children: [],
                depth: 0,
                visits: 0,
                createdAt: now,
            };
            const graph = {
                nodes: new Map([[rootId, rootNode]]),
                rootId,
                bestNodeId: Option.none(),
                iteration: 0,
                budgetUsed: 0,
            };
            yield* Ref.set(graphRef, Option.some(graph));
            yield* Effect.log(`[MCGS] Initialized graph with root: ${rootId}`);
            return graph;
        });
        /**
         * SELECT: UCT-based node selection.
         *
         * Selects the node with the highest UCT score:
         *   UCT = f_bar + c(t) * sqrt(ln(N) / n)
         *
         * where:
         *   f_bar = average eval score of the node
         *   c(t) = time-decayed exploration constant
         *   N = total visits to parent
         *   n = visits to this node
         *
         * Reference: Pioneer Agent §2.4 — "UCT selection balances
         * exploitation of high-scoring nodes with exploration of
         * under-sampled regions."
         */
        const selectUCT = (graph) => Effect.gen(function* () {
            let current = graph.nodes.get(graph.rootId);
            const path = [current.id];
            // Descend until we reach a leaf or unexpanded node
            while (current.children.length > 0 && current.depth < defaultOpts.maxDepth) {
                let bestScore = -Infinity;
                let bestChild;
                for (const childId of current.children) {
                    const child = graph.nodes.get(childId);
                    if (!child)
                        continue;
                    const uctScore = computeUCT(child, current.visits, defaultOpts.explorationConstant, graph.iteration, defaultOpts.decayFactor);
                    if (uctScore > bestScore) {
                        bestScore = uctScore;
                        bestChild = child;
                    }
                }
                if (!bestChild)
                    break;
                current = bestChild;
                path.push(current.id);
            }
            yield* Effect.log(`[MCGS] Selected node ${current.id} at depth ${current.depth} (path: ${path.join(" -> ")})`);
            return current;
        });
        /**
         * EXPAND: Generate child nodes by modifying D/H/S.
         *
         * The expansion is hypothesis-driven: it looks at the parent node's
         * failure taxonomy and generates children that address those failures.
         *
         * Expansion strategies:
         * - Modify D: Change data composition (more hard negatives, etc.)
         * - Modify H: Adjust hyperparameters (LoRA rank, LR, epochs)
         * - Modify S: Change learning strategy (direct -> CoT)
         *
         * Reference: Pioneer Agent §2.4 — "Expansion generates child nodes
         * by applying hypothesis-driven modifications to the parent pipeline."
         */
        const expand = (parent, taxonomy) => Effect.gen(function* () {
            const children = [];
            const now = new Date();
            // Strategy 1: Increase hard-negative ratio for top confusion clusters
            if (taxonomy.clusters.length > 0) {
                const topCluster = taxonomy.clusters[0];
                const childId = `${parent.id}-D-${Date.now()}`;
                const childPipeline = {
                    ...parent.pi,
                    D: {
                        ...parent.pi.D,
                        // Signal that we need more hard negatives for this cluster
                        qualityConstraints: {
                            ...parent.pi.D.qualityConstraints,
                            twoForOne: true,
                        },
                    },
                };
                children.push({
                    id: childId,
                    pi: childPipeline,
                    score: Option.none(),
                    parentId: Option.some(parent.id),
                    children: [],
                    depth: parent.depth + 1,
                    visits: 0,
                    createdAt: now,
                });
            }
            // Strategy 2: Increase LoRA rank for complex failures
            if (taxonomy.clusters.some((c) => c.category === "semantic")) {
                const childId = `${parent.id}-H-${Date.now()}`;
                const newRank = Math.min(parent.pi.H.loraRank * 2, 128);
                const childPipeline = {
                    ...parent.pi,
                    H: {
                        ...parent.pi.H,
                        loraRank: newRank,
                        epochs: parent.pi.H.epochs + 1,
                    },
                };
                children.push({
                    id: childId,
                    pi: childPipeline,
                    score: Option.none(),
                    parentId: Option.some(parent.id),
                    children: [],
                    depth: parent.depth + 1,
                    visits: 0,
                    createdAt: now,
                });
            }
            // Strategy 3: Switch to CoT format for logic errors
            if (taxonomy.clusters.some((c) => c.category === "logic") &&
                parent.pi.S.format === "direct") {
                const childId = `${parent.id}-S-${Date.now()}`;
                const childPipeline = {
                    ...parent.pi,
                    S: {
                        ...parent.pi.S,
                        format: "cot",
                    },
                };
                children.push({
                    id: childId,
                    pi: childPipeline,
                    score: Option.none(),
                    parentId: Option.some(parent.id),
                    children: [],
                    depth: parent.depth + 1,
                    visits: 0,
                    createdAt: now,
                });
            }
            // Strategy 4: Decrease learning rate for stability
            if (parent.depth > 2) {
                const childId = `${parent.id}-H-lr-${Date.now()}`;
                const childPipeline = {
                    ...parent.pi,
                    H: {
                        ...parent.pi.H,
                        learningRate: parent.pi.H.learningRate * 0.5,
                    },
                };
                children.push({
                    id: childId,
                    pi: childPipeline,
                    score: Option.none(),
                    parentId: Option.some(parent.id),
                    children: [],
                    depth: parent.depth + 1,
                    visits: 0,
                    createdAt: now,
                });
            }
            yield* Effect.log(`[MCGS] Expanded node ${parent.id} into ${children.length} children`);
            for (const c of children) {
                yield* Effect.log(`  Child ${c.id}: ${describeChange(parent.pi, c.pi)}`);
            }
            return children;
        });
        /**
         * Add a scored node to the graph.
         */
        const addNode = (graph, opts) => Effect.gen(function* () {
            const nodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const parent = graph.nodes.get(opts.parentId);
            if (!parent) {
                yield* Effect.logWarning(`[MCGS] Parent ${opts.parentId} not found`);
                return;
            }
            const node = {
                id: nodeId,
                pi: opts.pi,
                score: Option.some(opts.f),
                parentId: Option.some(opts.parentId),
                children: [],
                depth: parent.depth + 1,
                visits: 1,
                createdAt: new Date(),
            };
            // Update parent
            graph.nodes.set(opts.parentId, {
                ...parent,
                children: [...parent.children, nodeId],
                visits: parent.visits + 1,
            });
            // Add node to graph
            graph.nodes.set(nodeId, node);
            // Update best node if this score is better
            const currentBest = graph.bestNodeId._tag === "Some"
                ? graph.nodes.get(graph.bestNodeId.value)
                : undefined;
            const currentBestScore = currentBest?.score._tag === "Some" ? currentBest.score.value.passAt1 : 0;
            if (opts.f.passAt1 > currentBestScore) {
                graph.bestNodeId = Option.some(nodeId);
                yield* Ref.set(bestScoreRef, opts.f.passAt1);
                yield* Ref.set(stagnationRef, 0);
                yield* Effect.log(`[MCGS] New best node: ${nodeId} (pass@1=${(opts.f.passAt1 * 100).toFixed(1)}%)`);
            }
            else {
                yield* Ref.update(stagnationRef, (n) => n + 1);
            }
            graph.iteration++;
            graph.budgetUsed += estimateCost(opts.job);
        });
        /**
         * Check if the search should continue.
         */
        const shouldContinue = (graph, budget, maxIters) => Effect.sync(() => {
            if (graph.iteration >= maxIters)
                return false;
            if (graph.budgetUsed >= budget)
                return false;
            return true;
        });
        /**
         * Get the best node in the graph.
         */
        const best = (graph) => Effect.sync(() => {
            if (graph.bestNodeId._tag === "None") {
                // Return root if no best found
                return graph.nodes.get(graph.rootId);
            }
            return graph.nodes.get(graph.bestNodeId.value);
        });
        /**
         * Check if the search has stagnated.
         */
        const stagnated = (graph, threshold) => Ref.get(stagnationRef).pipe(Effect.map((count) => count >= threshold));
        /**
         * FUSE: Cross-branch fusion or trajectory-aware mutation.
         *
         * When stagnation is detected, this operator:
         * 1. Identifies promising branches (high-scoring leaves)
         * 2. Fuses their pipelines to create hybrid candidates
         * 3. Adds mutations to escape local optima
         *
         * Reference: Pioneer Agent §2.5 — "FUSE combines promising
         * branches and applies trajectory-aware mutation to escape
         * local optima."
         */
        const fuseOrEvolve = (graph) => Effect.gen(function* () {
            yield* Effect.log(`[MCGS] Stagnation detected — running FUSE operator...`);
            // Find all leaf nodes with scores
            const leaves = Array.from(graph.nodes.values()).filter((n) => n.children.length === 0 &&
                n.score._tag === "Some" &&
                n.score.value.passAt1 > 0.7);
            if (leaves.length < 2) {
                yield* Effect.log(`[MCGS] Not enough leaves for fusion — applying mutation instead`);
                // Apply random mutation to the best node
                const bestNode = yield* best(graph);
                const mutated = yield* mutate(bestNode);
                graph.nodes.set(mutated.id, mutated);
                yield* Effect.log(`[MCGS] Mutated node ${bestNode.id} -> ${mutated.id}`);
                return;
            }
            // Sort by score and take top 2
            leaves.sort((a, b) => (Option.getOrUndefined(b.score)?.passAt1 ?? 0) - (Option.getOrUndefined(a.score)?.passAt1 ?? 0));
            const [leaf1, leaf2] = leaves.slice(0, 2);
            // Fuse: combine data from both, take best hyperparams
            const fusedPipeline = {
                D: {
                    ...leaf1.pi.D,
                    gold: [...leaf1.pi.D.gold, ...leaf2.pi.D.gold].slice(0, 200),
                    hardNegatives: [
                        ...leaf1.pi.D.hardNegatives,
                        ...leaf2.pi.D.hardNegatives,
                    ].slice(0, 100),
                },
                H: {
                    ...leaf1.pi.H,
                    // Take the more conservative (lower) learning rate
                    learningRate: Math.min(leaf1.pi.H.learningRate, leaf2.pi.H.learningRate),
                    // Take the larger LoRA rank
                    loraRank: Math.max(leaf1.pi.H.loraRank, leaf2.pi.H.loraRank),
                },
                S: {
                    // Prefer CoT if either uses it
                    format: leaf1.pi.S.format === "cot" || leaf2.pi.S.format === "cot"
                        ? "cot"
                        : "direct",
                    teacherModel: leaf1.pi.S.teacherModel,
                    evalMethod: leaf2.pi.S.evalMethod,
                },
            };
            const fusedId = `fused-${Date.now()}`;
            const fusedNode = {
                id: fusedId,
                pi: fusedPipeline,
                score: Option.none(),
                parentId: Option.some(leaf1.id),
                children: [],
                depth: Math.max(leaf1.depth, leaf2.depth) + 1,
                visits: 0,
                createdAt: new Date(),
            };
            graph.nodes.set(fusedId, fusedNode);
            yield* Ref.set(stagnationRef, 0); // Reset stagnation
            yield* Effect.log(`[MCGS] FUSE created: ${fusedId} from ${leaf1.id} + ${leaf2.id}`);
        });
        /**
         * PRUNE: Remove low-utility subtrees.
         */
        const prune = (graph, threshold) => Effect.gen(function* () {
            let pruned = 0;
            for (const [id, node] of graph.nodes) {
                if (node.score._tag === "Some" &&
                    node.score.value.passAt1 < threshold &&
                    node.children.length === 0 &&
                    id !== graph.rootId) {
                    graph.nodes.delete(id);
                    pruned++;
                }
            }
            if (pruned > 0) {
                yield* Effect.log(`[MCGS] Pruned ${pruned} low-utility nodes`);
            }
        });
        return {
            init,
            selectUCT,
            expand,
            addNode,
            best,
            shouldContinue,
            stagnated,
            fuseOrEvolve,
            prune,
        };
    }),
    dependencies: [],
}) {
}
/**
 * Compute the UCT score for a node.
 *
 *   UCT = f_bar + c(t) * sqrt(ln(N) / n)
 *
 * Time decay: c(t) = C * decay^t  (exploration decreases over time)
 */
function computeUCT(node, parentVisits, explorationConstant, iteration, decayFactor) {
    const score = node.score._tag === "Some" ? node.score.value.passAt1 : 0.5; // Default prior for unvisited nodes
    const visits = Math.max(node.visits, 1);
    // Time-decayed exploration constant
    const ct = explorationConstant * Math.pow(decayFactor, iteration);
    // UCT formula
    const exploitation = score;
    const exploration = ct * Math.sqrt(Math.log(parentVisits + 1) / visits);
    return exploitation + exploration;
}
/**
 * Apply a random mutation to a node's pipeline.
 */
function mutate(node) {
    return Effect.sync(() => {
        const mutations = [
            // Increase LoRA rank
            (pi) => ({
                ...pi,
                H: { ...pi.H, loraRank: Math.min(pi.H.loraRank + 8, 128) },
            }),
            // Decrease learning rate
            (pi) => ({
                ...pi,
                H: { ...pi.H, learningRate: pi.H.learningRate * 0.7 },
            }),
            // Increase epochs
            (pi) => ({
                ...pi,
                H: { ...pi.H, epochs: Math.min(pi.H.epochs + 1, 10) },
            }),
            // Switch to CoT
            (pi) => ({
                ...pi,
                S: { ...pi.S, format: "cot" },
            }),
            // Increase batch size
            (pi) => ({
                ...pi,
                H: { ...pi.H, batchSize: Math.min(pi.H.batchSize + 2, 16) },
            }),
        ];
        const mutation = mutations[Math.floor(Math.random() * mutations.length)];
        const mutatedPipeline = mutation(node.pi);
        return {
            id: `mutated-${Date.now()}`,
            pi: mutatedPipeline,
            score: Option.none(),
            parentId: Option.some(node.id),
            children: [],
            depth: node.depth + 1,
            visits: 0,
            createdAt: new Date(),
        };
    });
}
/**
 * Estimate the cost of a training job (USD).
 */
function estimateCost(job) {
    // Rough cost estimation based on dataset size and epochs
    // GPU hours ~= dataset_size * epochs / 1000
    // At $2/hour for A100
    const gpuHours = (job.datasetSize * job.hparams.epochs) / 1000;
    return gpuHours * 2.5;
}
/**
 * Describe the change between two pipelines for logging.
 */
function describeChange(parent, child) {
    const changes = [];
    if (child.H.loraRank !== parent.H.loraRank)
        changes.push(`LoRA ${parent.H.loraRank}→${child.H.loraRank}`);
    if (child.H.learningRate !== parent.H.learningRate)
        changes.push(`LR ${parent.H.learningRate}→${child.H.learningRate}`);
    if (child.H.epochs !== parent.H.epochs)
        changes.push(`Epochs ${parent.H.epochs}→${child.H.epochs}`);
    if (child.S.format !== parent.S.format)
        changes.push(`Format ${parent.S.format}→${child.S.format}`);
    return changes.length > 0 ? changes.join(", ") : "(no change)";
}
export const SearchLive = Search.Default;
//# sourceMappingURL=search.js.map