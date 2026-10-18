import { describe, it } from "node:test"
import assert from "node:assert"
import { validateSkillReport, underivedScalars } from "../skill/report"

const SHA = "a1b2c3d4e5f60718"

function validReport(): Record<string, unknown> {
  return {
    skillLibrarySha: SHA,
    consulted: [
      {
        skill: "arrays",
        section: "Quantiles",
        verdict: "useful",
        evidence: "the quantile helper matched the reference implementation on task t3",
      },
    ],
    proposedEdits: [
      { skill: "arrays", section: "Quantiles", change: "add empty-case note", why: "verifier hit it" },
    ],
    proposedNew: [
      {
        skill: "arrays",
        title: "Quantile by sorted index",
        trigger: "need the p-quantile of a numeric array",
        code: "function quantile(xs: number[], p: number): number {\n  return p\n}",
        evidence: "verified on the stats task, 3/3 passes",
      },
    ],
  }
}

describe("skill/report validateSkillReport", () => {
  it("accepts a valid report", () => {
    const result = validateSkillReport(validReport())
    assert.ok(result.ok)
    if (result.ok) {
      assert.strictEqual(result.report.skillLibrarySha, SHA)
      assert.strictEqual(result.report.consulted.length, 1)
      assert.strictEqual(result.report.proposedNew.length, 1)
    }
  })

  it("rejects a non-object report", () => {
    const result = validateSkillReport([1, 2, 3])
    assert.ok(!result.ok)
  })

  it("rejects a bad skillLibrarySha", () => {
    const raw = validReport()
    raw.skillLibrarySha = "zzz"
    const result = validateSkillReport(raw)
    assert.ok(!result.ok)
    if (!result.ok) assert.ok(result.errors.some((e) => /skillLibrarySha/.test(e)))
  })

  it("rejects verdicts outside the vocab", () => {
    const raw = validReport()
    ;(raw.consulted as Array<Record<string, unknown>>)[0].verdict = "helpful"
    const result = validateSkillReport(raw)
    assert.ok(!result.ok)
    if (!result.ok) assert.ok(result.errors.some((e) => /verdict/.test(e)))
  })

  it("rejects a 'misleading' grade with short evidence", () => {
    const raw = validReport()
    const consulted = raw.consulted as Array<Record<string, unknown>>
    consulted[0].verdict = "misleading"
    consulted[0].evidence = "it lied"
    const result = validateSkillReport(raw)
    assert.ok(!result.ok)
    if (!result.ok) assert.ok(result.errors.some((e) => /misleading.*specifics|specifics.*misleading/.test(e)))
  })

  it("accepts a 'wrong' grade with specific evidence", () => {
    const raw = validReport()
    const consulted = raw.consulted as Array<Record<string, unknown>>
    consulted[0].verdict = "wrong"
    consulted[0].evidence =
      "the formula drops the middle element for even-length inputs; task median-2 fails 3/3 with it"
    assert.ok(validateSkillReport(raw).ok)
  })

  it("rejects proposedNew entries with unparseable code", () => {
    const raw = validReport()
    ;(raw.proposedNew as Array<Record<string, unknown>>)[0].code = "const x: = 1"
    const result = validateSkillReport(raw)
    assert.ok(!result.ok)
    if (!result.ok) assert.ok(result.errors.some((e) => /does not parse/.test(e)))
  })

  it("rejects proposedNew entries with empty fields", () => {
    const raw = validReport()
    ;(raw.proposedNew as Array<Record<string, unknown>>)[0].trigger = "  "
    const result = validateSkillReport(raw)
    assert.ok(!result.ok)
    if (!result.ok) assert.ok(result.errors.some((e) => /trigger is empty/.test(e)))
  })

  it("rejects proposed edits with empty fields", () => {
    const raw = validReport()
    ;(raw.proposedEdits as Array<Record<string, unknown>>)[0].why = ""
    const result = validateSkillReport(raw)
    assert.ok(!result.ok)
    if (!result.ok) assert.ok(result.errors.some((e) => /why is empty/.test(e)))
  })
})

describe("skill/report underivedScalars", () => {
  it("finds free names in arithmetic expressions", () => {
    assert.deepStrictEqual(underivedScalars("const y = a + 1"), ["a"])
    assert.deepStrictEqual(underivedScalars("const z = count - offset"), ["count", "offset"])
  })

  it("ignores names bound in the snippet", () => {
    assert.deepStrictEqual(
      underivedScalars("function f(x: number): number { return x * 2 }"),
      [],
    )
    assert.deepStrictEqual(
      underivedScalars("const xs = [1, 2]\nconst total = xs.reduce((a, b) => a + b)"),
      [],
    )
  })

  it("ignores non-arithmetic uses", () => {
    assert.deepStrictEqual(underivedScalars("console.log(name)"), [])
  })
})
