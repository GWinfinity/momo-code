import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { Effect } from "effect"
import {
  SkillLibrary,
  SkillLibraryLive,
  parseSkillFile,
  renderSkillFile,
} from "../skill/store"
import type { SkillReport, VerificationReport } from "../skill/schema"

function withLib<T>(use: (lib: SkillLibrary) => Effect.Effect<T, Error>): Promise<T> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const lib = yield* SkillLibrary
      return yield* use(lib)
    }).pipe(Effect.provide(SkillLibraryLive)),
  )
}

function skillsDir(home: string): string {
  return path.join(home, "skills")
}

function makeReport(overrides: Partial<SkillReport> = {}): SkillReport {
  return {
    skillLibrarySha: "0".repeat(16),
    consulted: [
      {
        skill: "arrays",
        section: "Quantiles",
        verdict: "useful",
        evidence: "the quantile helper matched the reference implementation",
      },
    ],
    proposedEdits: [
      {
        skill: "arrays",
        section: "Quantiles",
        change: "mention the empty-array case",
        why: "a verifier hit an empty input once",
      },
    ],
    proposedNew: [
      {
        skill: "arrays",
        title: "Quantile by sorted index",
        trigger: "need the p-quantile of a numeric array",
        code: "function quantile(xs: number[], p: number): number {\n  const sorted = [...xs].sort((a, b) => a - b)\n  const i = Math.round(p * (sorted.length - 1))\n  return sorted[i]\n}",
        evidence: "verified on the stats task, 3/3 passes",
      },
    ],
    ...overrides,
  }
}

function verifiedReport(overrides: Partial<VerificationReport> = {}): VerificationReport {
  return {
    attemptsUsed: 1,
    trials: 1,
    passes: 1,
    verdict: "verified",
    proposals: [],
    gaps: [],
    notes: "",
    ...overrides,
  }
}

describe("skill/store", () => {
  let tmpDir: string
  let saved: string | undefined

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-skill-"))
    saved = process.env.MOMO_CONFIG_DIR
    process.env.MOMO_CONFIG_DIR = tmpDir
  })

  after(() => {
    if (saved === undefined) delete process.env.MOMO_CONFIG_DIR
    else process.env.MOMO_CONFIG_DIR = saved
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("list/read round-trips a skill file", async () => {
    fs.mkdirSync(skillsDir(tmpDir), { recursive: true })
    fs.writeFileSync(
      path.join(skillsDir(tmpDir), "arrays.md"),
      renderSkillFile("arrays", "array helpers", [
        {
          skill: "arrays",
          title: "Clamp",
          trigger: "bound a number",
          code: "function clamp(v: number): number { return v }",
          evidence: "verified",
        },
      ]),
    )
    const names = await withLib((lib) => lib.list())
    assert.deepStrictEqual(names, ["arrays"])
    const text = await withLib((lib) => lib.read("arrays"))
    assert.ok(text?.includes("### Clamp"))
    assert.strictEqual(await withLib((lib) => lib.read("missing")), null)
  })

  it("sha is stable, and changes when library content changes", async () => {
    fs.mkdirSync(skillsDir(tmpDir), { recursive: true })
    const file = path.join(skillsDir(tmpDir), "a.md")
    fs.writeFileSync(file, "# a\n")
    const s1 = await withLib((lib) => lib.sha())
    const s2 = await withLib((lib) => lib.sha())
    assert.strictEqual(s1, s2)
    assert.match(s1, /^[0-9a-f]{16}$/)
    fs.writeFileSync(file, "# a\nmore\n")
    const s3 = await withLib((lib) => lib.sha())
    assert.notStrictEqual(s1, s3)
  })

  it("sha excludes README.md and changelog/", async () => {
    fs.mkdirSync(skillsDir(tmpDir), { recursive: true })
    fs.writeFileSync(path.join(skillsDir(tmpDir), "a.md"), "# a\n")
    const before = await withLib((lib) => lib.sha())
    fs.writeFileSync(path.join(skillsDir(tmpDir), "README.md"), "# docs\n")
    fs.mkdirSync(path.join(skillsDir(tmpDir), "changelog"), { recursive: true })
    fs.writeFileSync(path.join(skillsDir(tmpDir), "changelog", "a.md"), "# history\n")
    const after = await withLib((lib) => lib.sha())
    assert.strictEqual(before, after)
  })

  it("stageProposal stages files without touching the library", async () => {
    const shaBefore = await withLib((lib) => lib.sha())
    const campaignDir = path.join(tmpDir, "skill-campaigns", "c1")
    const outcome = await withLib((lib) => lib.stageProposal(makeReport(), campaignDir))
    assert.strictEqual(outcome.proposalFiles.length, 1)
    assert.strictEqual(outcome.patchFiles.length, 1)
    assert.ok(fs.existsSync(outcome.reportFile))
    // the staged proposal round-trips through the skill-file parser
    const parsed = parseSkillFile(fs.readFileSync(outcome.proposalFiles[0], "utf-8"))
    assert.strictEqual(parsed.name, "arrays")
    assert.strictEqual(parsed.entries.length, 1)
    assert.strictEqual(parsed.entries[0].title, "Quantile by sorted index")
    assert.ok(parsed.entries[0].code.includes("function quantile"))
    // library untouched — content hash identical before and after staging
    const shaAfter = await withLib((lib) => lib.sha())
    assert.strictEqual(shaBefore, shaAfter)
  })

  it("applyVerified creates a new skill file for a staged entry", async () => {
    const report = makeReport()
    report.proposedNew[0].skill = "fresh"
    const campaignDir = path.join(tmpDir, "skill-campaigns", "c2")
    await withLib((lib) => lib.stageProposal(report, campaignDir))
    const outcome = await withLib((lib) =>
      lib.applyVerified(verifiedReport(), campaignDir),
    )
    assert.deepStrictEqual(outcome.applied, ["fresh §Quantile by sorted index"])
    const text = await withLib((lib) => lib.read("fresh"))
    assert.ok(text?.includes("### Quantile by sorted index"))
    assert.ok(text?.startsWith("---\nname: fresh"))
    // staging/apply did not write grade records
    assert.strictEqual(await withLib((lib) => lib.ledgerSize()), 0)
  })

  it("applyVerified replaces in place (replace-not-annotate) and archives the old text", async () => {
    // seed library with an entry of the same title
    fs.mkdirSync(skillsDir(tmpDir), { recursive: true })
    fs.writeFileSync(
      path.join(skillsDir(tmpDir), "stats.md"),
      renderSkillFile("stats", "stats helpers", [
        {
          skill: "stats",
          title: "Quantile by sorted index",
          trigger: "old trigger",
          code: "function quantile(xs: number[]): number { return 0 }",
          evidence: "old evidence",
        },
      ]),
    )
    const report = makeReport()
    report.proposedNew[0].skill = "stats"
    report.proposedEdits[0].skill = "stats"
    const campaignDir = path.join(tmpDir, "skill-campaigns", "c3")
    await withLib((lib) => lib.stageProposal(report, campaignDir))

    const outcome = await withLib((lib) =>
      lib.applyVerified(verifiedReport(), campaignDir),
    )
    assert.deepStrictEqual(outcome.applied, ["stats §Quantile by sorted index"])

    const text = await withLib((lib) => lib.read("stats"))
    assert.ok(text?.includes("function quantile(xs: number[], p: number)"))
    // exactly one entry with that title — overwritten, not annotated
    assert.strictEqual(text?.split("### Quantile by sorted index").length, 2)
    assert.ok(!text?.includes("old evidence"))

    // old text moved to the changelog
    const changelog = fs.readFileSync(
      path.join(skillsDir(tmpDir), "changelog", "stats.md"),
      "utf-8",
    )
    assert.ok(changelog.includes("replaced"))
    assert.ok(changelog.includes("old evidence"))
    // and the prose edit patch was recorded there too
    assert.ok(changelog.includes("Proposed edit"))
    assert.ok(changelog.includes("mention the empty-array case"))
  })

  it("applyVerified honours structural sound/disposition grading when present", async () => {
    fs.mkdirSync(skillsDir(tmpDir), { recursive: true })
    const report = makeReport()
    report.proposedNew[0].skill = "graded"
    const campaignDir = path.join(tmpDir, "skill-campaigns", "c4")
    await withLib((lib) => lib.stageProposal(report, campaignDir))
    const outcome = await withLib((lib) =>
      lib.applyVerified(
        verifiedReport({
          proposals: [
            { title: "Quantile by sorted index", disposition: "defective", note: "fails on empty input" },
          ],
        }),
        campaignDir,
      ),
    )
    assert.deepStrictEqual(outcome.applied, [])
    assert.deepStrictEqual(outcome.skipped, ["graded §Quantile by sorted index"])
    assert.strictEqual(await withLib((lib) => lib.read("graded")), null)
  })

  it("recordGrades appends JSONL grade records to the ledger", async () => {
    const n = await withLib((lib) => lib.recordGrades(makeReport()))
    assert.strictEqual(n, 1)
    const ledger = fs.readFileSync(
      path.join(skillsDir(tmpDir), "ledger.jsonl"),
      "utf-8",
    )
    const lines = ledger.trim().split("\n").filter(Boolean)
    assert.strictEqual(lines.length, 1)
    const entry = JSON.parse(lines[0])
    assert.strictEqual(entry.kind, "grade")
    assert.strictEqual(entry.skill, "arrays")
    assert.strictEqual(entry.verdict, "useful")
    assert.ok(entry.ts)
    assert.strictEqual(await withLib((lib) => lib.ledgerSize()), 1)
  })
})
