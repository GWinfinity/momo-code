/**
 * /fine-tune command — Weight slow loop (MCGS)
 *
 * 5-step pipeline: Curriculum → Baseline → Train (Priors) → Candidate Eval → Ratchet Gate
 *
 * Subcommands:
 *   (none)    diagnose  — Print health report from tactics.json + ledger.jsonl
 *   run       — Execute the full 5-step training pipeline
 *   status    — List all finetune runs
 *   promote   — Promote a run's candidate to production
 *   rollback  — Roll back to pre-promotion state
 */
import fs from "fs"
import os from "os"
import path from "path"
import { type Tactic, winRate } from "../../experience/tactic.js"

// ---------------------------------------------------------------------------
// Local type definitions
// ---------------------------------------------------------------------------

interface CurriculumEntry {
	context: string
	action: string
	expected: string
	category: "gold" | "replay" | "hard-negative"
	tacticId: string
}

interface BaselineResult {
	passAt1: number
	total: number
	heldOut: number
	seed: number
	perTask: Record<string, number>
}

interface RatchetResult {
	eps: number
	delta: number
	regressions: number
	passed: boolean
	rule: string
}

interface RunInfo {
	runId: string
	timestamp: string
	ratchetPassed: boolean
	promoted: boolean
}

interface ProductionPointer {
	runId: string
	backupPath: string
	promotedAt: string
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

export function showFinetuneHelp(): void {
	console.log(`
momo /fine-tune — Self-evolution training (MCGS)

5-step: Curriculum → Baseline → Train (Priors) → Candidate Eval → Ratchet Gate

USAGE:   momo /fine-tune [SUBCOMMAND] [options]
SUB:     (none)=diagnose  run  status  promote  rollback
OPTIONS: --auto  --seed=N  --eps=N  --dry-run  --help`)
}

function parseArgs(args: string[]) {
	const r = {
		sub: "diagnose" as string,
		auto: false,
		seed: 42,
		eps: 0.02,
		dryRun: false,
		help: false,
		// remaining positional args (e.g. run-id for promote)
		positional: [] as string[],
	}
	for (const a of args) {
		if (a === "--help" || a === "-h") r.help = true
		else if (["run", "status", "promote", "rollback", "diagnose"].includes(a))
			r.sub = a
		else if (a === "--auto") r.auto = true
		else if (a.startsWith("--seed=")) r.seed = parseInt(a.slice(7), 10)
		else if (a.startsWith("--eps=")) r.eps = parseFloat(a.slice(6))
		else if (a === "--dry-run") r.dryRun = true
		else if (!a.startsWith("-")) r.positional.push(a)
	}
	return r
}

export function runFinetuneCommand(args: string[]): void {
	try {
		const opts = parseArgs(args)
		if (opts.help) {
			showFinetuneHelp()
			return
		}
		switch (opts.sub) {
			case "diagnose":
				doDiagnose()
				break
			case "run":
				doRun(opts)
				break
			case "status":
				doStatus()
				break
			case "promote": {
				const runId = opts.positional[0]
				if (!runId) {
					console.log("Usage: momo /fine-tune promote <run-id>")
					return
				}
				doPromote(runId)
				break
			}
			case "rollback":
				doRollback()
				break
			default:
				showFinetuneHelp()
		}
	} catch (e: any) {
		console.error(`Error: ${e?.message || e}`)
		process.exitCode = 1
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load tactics from file — handles both { tactics: [...] } and [...] formats. */
function loadTacticsFromFile(filePath: string): Tactic[] {
	if (!fs.existsSync(filePath)) return []
	const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))
	return Array.isArray(data) ? data : data.tactics || []
}

// ---------------------------------------------------------------------------
// 1. diagnose (default subcommand)
// ---------------------------------------------------------------------------

function doDiagnose(): void {
	const xpDir = getXpDir()
	const tacticsPath = path.join(xpDir, "tactics.json")
	const ledgerPath = path.join(xpDir, "ledger.jsonl")

	// Read tactics
	const tactics = loadTacticsFromFile(tacticsPath)

	// Count by status
	const byStatus = { draft: 0, active: 0, promoted: 0, retired: 0 }
	for (const t of tactics) {
		byStatus[t.status] = (byStatus[t.status] || 0) + 1
	}

	// Read ledger
	const ledgerSize = fs.existsSync(ledgerPath)
		? fs
				.readFileSync(ledgerPath, "utf-8")
				.split("\n")
				.filter((l) => l.trim()).length
		: 0

	// Output
	console.log(`\n🔬 /fine-tune Diagnosis`)
	console.log(`  Tactics: ${tactics.length} total`)
	console.log(
		`    draft: ${byStatus.draft}  active: ${byStatus.active}  promoted: ${byStatus.promoted}  retired: ${byStatus.retired}`,
	)
	console.log(`  Ledger:  ${ledgerSize} entries`)

	// Recommend next step
	const trainable = tactics.filter(
		(t) => t.status === "promoted" || t.status === "active",
	).length
	if (trainable < 3) {
		console.log(`\n  💡 Need more tactics. Run: momo /evolve --demo`)
	} else if (byStatus.promoted === 0) {
		console.log(
			`\n  💡 Solidify tactics to promote them: momo /evolve --solidify <id> pass`,
		)
	} else {
		console.log(`\n  ✅ Ready for training. Run: momo /fine-tune run --auto`)
	}
}

// ---------------------------------------------------------------------------
// 2. run --auto (full 5-step pipeline)
// ---------------------------------------------------------------------------

function doRun(opts: ReturnType<typeof parseArgs>): void {
	console.log(`\n🏋️ /fine-tune Training`)
	if (opts.dryRun) console.log(`  [DRY RUN]`)

	// ---- Setup ----
	const finetuneDir = getFinetuneDir()
	ensureDir(finetuneDir)

	const runId = `run_${Date.now()}`
	const runDir = path.join(finetuneDir, "runs", runId)
	ensureDir(runDir)
	ensureDir(path.join(runDir, "logs"))

	const tacticsPath = path.join(getXpDir(), "tactics.json")
	const tactics = loadTacticsFromFile(tacticsPath)

	if (tactics.length === 0) {
		console.log("  No tactics found. Run momo /evolve --demo first.")
		return
	}

	console.log(`  Run ID: ${runId}`)
	console.log(`  Tactics: ${tactics.length}`)
	console.log(`  Seed: ${opts.seed}`)
	console.log(``)

	// ---- Step 1: Curriculum ----
	console.log(`  Step 1/5: 📚 Curriculum`)
	const curriculum = generateCurriculum(tactics, runDir)
	const curriculumPath = path.join(runDir, "curriculum.jsonl")
	const curriculumLines = curriculum.map((e) => JSON.stringify(e))
	fs.writeFileSync(curriculumPath, curriculumLines.join("\n") + "\n")
	console.log(
		`    Gold: ${curriculum.filter((c) => c.category === "gold").length}  Replay: ${curriculum.filter((c) => c.category === "replay").length}  Hard-negative: ${curriculum.filter((c) => c.category === "hard-negative").length}`,
	)

	// ---- Step 2: Baseline Eval ----
	console.log(`  Step 2/5: 🧪 Baseline Eval`)
	const { heldOut } = splitHeldOut(tactics, opts.seed)
	const baseline = evaluateBaseline(heldOut, opts.seed, tactics.length)
	const baselinePath = path.join(runDir, "baseline.json")
	writeJsonAtomic(baselinePath, baseline)
	console.log(`    pass@1: ${(baseline.passAt1 * 100).toFixed(1)}%  held-out: ${baseline.heldOut}/${baseline.total}`)

	// ---- Step 3: Train (Priors driver) ----
	console.log(`  Step 3/5: ⚡ Train (Priors)`)
	if (opts.dryRun) {
		console.log(`    [DRY RUN] — skipping parameter updates`)
	} else {
		const updated = trainPriors(tactics, curriculum)
		// Count transitions
		let transitions = 0
		for (let i = 0; i < tactics.length; i++) {
			if (tactics[i].status !== updated[i].status) transitions++
		}
		console.log(`    ${transitions} status transition(s)`)
		// Write candidate tactics
		const candidateTacticsPath = path.join(runDir, "tactics.candidate.json")
		writeJsonAtomic(candidateTacticsPath, { tactics: updated })
		// Use updated tactics for candidate eval
		const candidate = evaluateCandidate(updated, heldOut, opts.seed, tactics.length)
		const candidatePath = path.join(runDir, "candidate.json")
		writeJsonAtomic(candidatePath, candidate)
		console.log(`    pass@1: ${(candidate.passAt1 * 100).toFixed(1)}%`)

		// ---- Step 5: Ratchet Gate ----
		console.log(`  Step 5/5: 🔒 Ratchet Gate`)
		const ratchet = ratchetCheck(baseline, candidate, opts.eps)
		const ratchetPath = path.join(runDir, "ratchet.json")
		writeJsonAtomic(ratchetPath, ratchet)
		console.log(
			`    Δ = ${ratchet.delta >= 0 ? "+" : ""}${(ratchet.delta * 100).toFixed(1)}%  regressions: ${ratchet.regressions}  eps: ${ratchet.eps}`,
		)

		// ---- Step 6: Stage ----
		if (ratchet.passed) {
			console.log(`\n  ✓ Ratchet PASS — candidate staged`)
		} else {
			// Remove candidate file on failure
			if (fs.existsSync(candidateTacticsPath)) {
				fs.unlinkSync(candidateTacticsPath)
			}
			console.log(`\n  ✗ Ratchet FAIL — candidate rejected`)
		}

		// ---- Write run.json ----
		const runInfo: RunInfo = {
			runId,
			timestamp: new Date().toISOString(),
			ratchetPassed: ratchet.passed,
			promoted: false,
		}
		writeJsonAtomic(path.join(runDir, "run.json"), runInfo)

		console.log(`\n  📁 Output: ${runDir}`)
	}
}

// ---------------------------------------------------------------------------
// Step 1: Curriculum generation
// ---------------------------------------------------------------------------

function generateCurriculum(tactics: Tactic[], _runDir: string): CurriculumEntry[] {
	const entries: CurriculumEntry[] = []

	// Gold: promoted tactics with wins > 0
	const goldTactics = tactics.filter(
		(t) => t.status === "promoted" && t.stats.wins > 0,
	)
	for (const t of goldTactics) {
		entries.push({
			context: t.title,
			action: t.steps.join("; "),
			expected: t.steps.join("; "),
			category: "gold",
			tacticId: t.id,
		})
	}

	// Replay: high winRate tactics (>= 0.75, uses >= 3)
	const replayTactics = tactics.filter(
		(t) => winRate(t.stats) >= 0.75 && t.stats.uses >= 3,
	)
	for (const t of replayTactics) {
		entries.push({
			context: t.title,
			action: t.steps.join("; "),
			expected: t.steps.join("; "),
			category: "replay",
			tacticId: t.id,
		})
	}

	// Hard-negative: tactics with losses > 0
	const lossTactics = tactics.filter((t) => t.stats.losses > 0)
	for (const t of lossTactics) {
		entries.push({
			context: t.title,
			action: t.steps.join("; "),
			expected: "AVOID applying without checking preconditions",
			category: "hard-negative",
			tacticId: t.id,
		})
	}

	return entries
}

// ---------------------------------------------------------------------------
// Step 2: Baseline evaluation
// ---------------------------------------------------------------------------

function evaluateBaseline(
	heldOut: Tactic[],
	seed: number,
	total: number,
): BaselineResult {
	const perTask: Record<string, number> = {}
	for (const t of heldOut) {
		perTask[t.id] = winRate(t.stats)
	}

	const passAt1 =
		heldOut.length > 0
			? heldOut.reduce((sum, t) => sum + winRate(t.stats), 0) / heldOut.length
			: 0

	return {
		passAt1,
		total,
		heldOut: heldOut.length,
		seed,
		perTask,
	}
}

// ---------------------------------------------------------------------------
// Step 3: Train (Priors driver)
// ---------------------------------------------------------------------------

function trainPriors(tactics: Tactic[], curriculum: CurriculumEntry[]): Tactic[] {
	// Update stats from curriculum
	const updated = tactics.map((t) => {
		const relevant = curriculum.filter((c) => c.tacticId === t.id)
		const wins = relevant.filter(
			(c) => c.category === "gold" || c.category === "replay",
		).length
		const losses = relevant.filter(
			(c) => c.category === "hard-negative",
		).length

		if (wins === 0 && losses === 0) return t

		return {
			...t,
			stats: {
				...t.stats,
				alpha: t.stats.alpha + wins,
				beta: t.stats.beta + losses,
				wins: t.stats.wins + wins,
				losses: t.stats.losses + losses,
				uses: t.stats.uses + relevant.length,
			},
		}
	})

	// Trigger lifecycle transitions
	return updated.map((t) => {
		const wr = winRate(t.stats)
		if (t.status === "draft" && wr >= 0.6 && t.stats.uses >= 3)
			return { ...t, status: "active" as const }
		if (t.status === "active" && wr >= 0.75 && t.stats.uses >= 5)
			return { ...t, status: "promoted" as const }
		if (t.status === "active" && wr <= 0.3 && t.stats.uses >= 5)
			return { ...t, status: "retired" as const }
		return t
	})
}

// ---------------------------------------------------------------------------
// Step 4: Candidate evaluation
// ---------------------------------------------------------------------------

function evaluateCandidate(
	updated: Tactic[],
	heldOut: Tactic[],
	seed: number,
	total: number,
): BaselineResult {
	// Build lookup from updated tactics
	const updatedMap = new Map(updated.map((t) => [t.id, t]))

	const perTask: Record<string, number> = {}
	for (const t of heldOut) {
		const ut = updatedMap.get(t.id)
		perTask[t.id] = ut ? winRate(ut.stats) : winRate(t.stats)
	}

	const passAt1 =
		heldOut.length > 0
			? heldOut.reduce((sum, t) => {
					const ut = updatedMap.get(t.id)
					return sum + (ut ? winRate(ut.stats) : winRate(t.stats))
				}, 0) / heldOut.length
			: 0

	return {
		passAt1,
		total,
		heldOut: heldOut.length,
		seed,
		perTask,
	}
}

// ---------------------------------------------------------------------------
// Step 5: Ratchet Gate
// ---------------------------------------------------------------------------

function ratchetCheck(
	baseline: BaselineResult,
	candidate: BaselineResult,
	eps = 0.02,
): RatchetResult {
	const regressions: string[] = []
	for (const [taskId, baseScore] of Object.entries(baseline.perTask)) {
		const candScore = candidate.perTask[taskId]
		if (baseScore !== undefined && candScore !== undefined) {
			if (baseScore >= 0.5 && candScore < 0.5) {
				regressions.push(taskId)
			}
		}
	}

	const delta = candidate.passAt1 - baseline.passAt1
	const passed =
		candidate.passAt1 >= baseline.passAt1 - eps && regressions.length === 0

	return {
		eps,
		delta,
		regressions: regressions.length,
		passed,
		rule: "candidate.passAt1 >= baseline.passAt1 - eps AND no regressed tasks",
	}
}

// ---------------------------------------------------------------------------
// 3. status — list all runs
// ---------------------------------------------------------------------------

function doStatus(): void {
	const runsDir = path.join(getFinetuneDir(), "runs")
	if (!fs.existsSync(runsDir)) {
		console.log("No runs yet")
		return
	}

	const runs = fs
		.readdirSync(runsDir)
		.filter((d) => fs.existsSync(path.join(runsDir, d, "run.json")))
		.sort()
		.reverse()

	if (runs.length === 0) {
		console.log("No runs yet")
		return
	}

	console.log(`\n📊 /fine-tune Status\n`)
	for (const runId of runs) {
		const runPath = path.join(runsDir, runId, "run.json")
		const runInfo: RunInfo = JSON.parse(fs.readFileSync(runPath, "utf-8"))
		const status = runInfo.promoted
			? "🟢 promoted"
			: runInfo.ratchetPassed
				? "🟡 staged"
				: "🔴 failed"
		console.log(
			`  ${runId}  ${status}  ${new Date(runInfo.timestamp).toLocaleDateString()}`,
		)
	}
}

// ---------------------------------------------------------------------------
// 4. promote — atomically replace production tactics
// ---------------------------------------------------------------------------

function doPromote(runId: string): void {
	const finetuneDir = getFinetuneDir()
	const runDir = path.join(finetuneDir, "runs", runId)
	const candidatePath = path.join(runDir, "tactics.candidate.json")
	const tacticsPath = path.join(getXpDir(), "tactics.json")
	const backupPath = path.join(runDir, "tactics.production.backup.json")

	if (!fs.existsSync(candidatePath)) {
		console.log("❌ No candidate found. Run /fine-tune run first.")
		return
	}

	// 1. Backup current tactics
	if (fs.existsSync(tacticsPath)) {
		fs.copyFileSync(tacticsPath, backupPath)
	}

	// 2. Replace with candidate
	fs.copyFileSync(candidatePath, tacticsPath)

	// 3. Write production pointer
	const productionPath = path.join(finetuneDir, "production.json")
	const pointer: ProductionPointer = {
		runId,
		backupPath,
		promotedAt: new Date().toISOString(),
	}
	writeJsonAtomic(productionPath, pointer)

	// 4. Update run.json to mark as promoted
	const runJsonPath = path.join(runDir, "run.json")
	if (fs.existsSync(runJsonPath)) {
		const runInfo: RunInfo = JSON.parse(fs.readFileSync(runJsonPath, "utf-8"))
		writeJsonAtomic(runJsonPath, { ...runInfo, promoted: true })
	}

	console.log(`✅ Promoted ${runId} → tactics.json`)
}

// ---------------------------------------------------------------------------
// 5. rollback — restore pre-promotion state
// ---------------------------------------------------------------------------

function doRollback(): void {
	const finetuneDir = getFinetuneDir()
	const productionPath = path.join(finetuneDir, "production.json")

	if (!fs.existsSync(productionPath)) {
		console.log("❌ No promotion to rollback.")
		return
	}

	const pointer: ProductionPointer = JSON.parse(
		fs.readFileSync(productionPath, "utf-8"),
	)
	const tacticsPath = path.join(getXpDir(), "tactics.json")

	// Restore from backup
	if (fs.existsSync(pointer.backupPath)) {
		fs.copyFileSync(pointer.backupPath, tacticsPath)
	}

	// Update run.json to unmark promotion
	const runDir = path.join(finetuneDir, "runs", pointer.runId)
	const runJsonPath = path.join(runDir, "run.json")
	if (fs.existsSync(runJsonPath)) {
		const runInfo: RunInfo = JSON.parse(fs.readFileSync(runJsonPath, "utf-8"))
		writeJsonAtomic(runJsonPath, { ...runInfo, promoted: false })
	}

	// Clear pointer
	fs.unlinkSync(productionPath)

	console.log(`✅ Rolled back to pre-${pointer.runId} state`)
}

// ---------------------------------------------------------------------------
// PRNG & held-out split
// ---------------------------------------------------------------------------

function splitHeldOut<T>(items: T[], seed: number): { train: T[]; heldOut: T[] } {
	const rng = mulberry32(seed)
	// Fisher-Yates shuffle using our PRNG
	const shuffled = [...items]
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1))
		;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
	}
	const splitIdx = Math.floor(shuffled.length * 0.8)
	return { train: shuffled.slice(0, splitIdx), heldOut: shuffled.slice(splitIdx) }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getXpDir(): string {
	return process.env.MOMO_XP_DIR || path.join(os.homedir(), ".momo", "experience")
}

function getFinetuneDir(): string {
	return path.join(os.homedir(), ".momo", "finetune")
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function writeJsonAtomic(filePath: string, data: unknown): void {
	const tmp = `${filePath}.tmp.${Date.now()}`
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
	fs.renameSync(tmp, filePath)
}

/** Mulberry32 PRNG — deterministic, seedable, fast. */
function mulberry32(a: number) {
	return function () {
		let t = (a += 0x6d2b79f5)
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
