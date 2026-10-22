import { describe, it, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { lintLibrary, lintProposalFile } from "../skill/lint"

const dirs: string[] = []

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-skill-lint-"))
  dirs.push(dir)
  return dir
}

function write(dir: string, name: string, content: string): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, content, "utf-8")
  return file
}

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe("skill/lint", () => {
  it("flags an unparseable code fence", () => {
    const dir = makeDir()
    write(dir, "bad-parse.md", ["## Broken", "", "```ts", "const x: = 1", "```"].join("\n"))
    const result = lintLibrary(dir)
    assert.ok(
      result.errors.some((e) => e.check === "unparseable-fence" && e.file === "bad-parse.md"),
    )
  })

  it("flags a helper that is called but defined nowhere", () => {
    const dir = makeDir()
    write(
      dir,
      "bad-helper.md",
      ["## Quantiles", "", "```ts", "const q = quantile([1, 2, 3], 0.5)", "```"].join("\n"),
    )
    const result = lintLibrary(dir)
    const hit = result.errors.find((e) => e.check === "undefined-helper")
    assert.ok(hit)
    assert.match(hit.message, /'quantile'/)
  })

  it("flags a dangling § cross-reference", () => {
    const dir = makeDir()
    write(dir, "target.md", "## Existing Section\n\nsome text\n")
    write(dir, "referrer.md", "See target.md §Missing Bits for details.\n")
    const result = lintLibrary(dir)
    assert.ok(
      result.errors.some(
        (e) =>
          e.check === "dangling-section-ref" &&
          e.file === "referrer.md" &&
          /Missing Bits/.test(e.message),
      ),
    )
  })

  it("resolves a § cross-reference that matches a heading", () => {
    const dir = makeDir()
    write(dir, "ok-target.md", "## Empty Case Handling\n\nsome text\n")
    write(dir, "ok-referrer.md", "See ok-target.md §Empty Case Handling.\n")
    const result = lintLibrary(dir)
    assert.ok(
      !result.errors.some(
        (e) => e.check === "dangling-section-ref" && e.file === "ok-referrer.md",
      ),
    )
  })

  it("warns on a search loop seeded with a default (no empty case)", () => {
    const dir = makeDir()
    write(
      dir,
      "warn-loop.md",
      [
        "## Search",
        "",
        "```ts",
        "const xs = [1, 2, 3]",
        "let found = -1",
        "for (const x of xs) {",
        "  if (x > 2) {",
        "    found = x",
        "    break",
        "  }",
        "}",
        "console.log(found)",
        "```",
      ].join("\n"),
    )
    const result = lintLibrary(dir)
    assert.strictEqual(result.errors.length, 0)
    assert.ok(
      result.warnings.some((w) => w.check === "seeded-search-loop" && /'found'/.test(w.message)),
    )
  })

  it("warns on Math.min/max over a spread with no emptiness guard", () => {
    const dir = makeDir()
    write(
      dir,
      "warn-minmax.md",
      [
        "## Min",
        "",
        "```ts",
        "export function smallest(values: number[]): number {",
        "  return Math.min(...values)",
        "}",
        "```",
      ].join("\n"),
    )
    const result = lintLibrary(dir)
    assert.strictEqual(result.errors.length, 0)
    assert.ok(result.warnings.some((w) => w.check === "unguarded-min-max"))
  })

  it("does not warn when the spread has an emptiness guard", () => {
    const dir = makeDir()
    write(
      dir,
      "guarded.md",
      [
        "## Min",
        "",
        "```ts",
        "export function smallest(values: number[]): number {",
        "  if (values.length === 0) throw new Error('empty')",
        "  return Math.min(...values)",
        "}",
        "```",
      ].join("\n"),
    )
    const result = lintLibrary(dir)
    assert.deepStrictEqual(result.errors, [])
    assert.deepStrictEqual(result.warnings, [])
  })

  it("passes a clean file with zero errors and zero warnings", () => {
    const dir = makeDir()
    write(
      dir,
      "clean.md",
      [
        "---",
        "name: clean",
        "description: clean file",
        "---",
        "",
        "## Ranges",
        "",
        "### Clamp a number",
        "",
        "**Trigger**: bound a number to a range.",
        "",
        "```ts",
        "export function clamp(value: number, low: number, high: number): number {",
        "  return Math.min(high, Math.max(low, value))",
        "}",
        "```",
        "",
        "**Evidence**: verified on the clamp task, 3/3 passes.",
        "",
        "```ts",
        "// a second fence may reuse clamp — it is declared in this file",
        "const bounded = clamp(5, 0, 3)",
        "console.log(bounded)",
        "```",
      ].join("\n"),
    )
    const result = lintLibrary(dir)
    assert.deepStrictEqual(result.errors, [])
    assert.deepStrictEqual(result.warnings, [])
  })

  it("counts helpers defined in another fence of the same file as defined", () => {
    const dir = makeDir()
    write(
      dir,
      "cross-fence.md",
      [
        "## Helpers",
        "",
        "```ts",
        "function helper(x: number): number { return x + 1 }",
        "```",
        "",
        "## Use",
        "",
        "```ts",
        "const y = helper(1)",
        "console.log(y)",
        "```",
      ].join("\n"),
    )
    const result = lintLibrary(dir)
    assert.deepStrictEqual(result.errors, [])
  })

  it("proposal lint: library helpers satisfy uses, but proposal errors still report", () => {
    const libDir = makeDir()
    write(
      libDir,
      "stats.md",
      [
        "## Quantiles",
        "",
        "```ts",
        "function quantile(xs: number[], p: number): number {",
        "  return p",
        "}",
        "```",
      ].join("\n"),
    )
    const proposal = write(
      makeDir(),
      "proposal.md",
      [
        "## Proposed",
        "",
        "```ts",
        "const q = quantile([1, 2, 3], 0.5)",
        "const r = bogusFn(q)",
        "console.log(r)",
        "```",
      ].join("\n"),
    )
    const result = lintProposalFile(proposal, libDir)
    // quantile comes from the library → only bogusFn is undefined
    const undef = result.errors.filter((e) => e.check === "undefined-helper")
    assert.strictEqual(undef.length, 1)
    assert.match(undef[0].message, /'bogusFn'/)
    // and the library file itself is never reported as an error source
    assert.ok(!result.errors.some((e) => e.file === "stats.md"))
  })
})
