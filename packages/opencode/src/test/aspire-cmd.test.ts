import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { runAspireCommand } from "../cli/cmd/aspire"
import { parseSkillFile } from "../skill/store"

function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "))
  }
  return fn()
    .then((result) => ({ result, logs }))
    .finally(() => {
      console.log = original
    })
}

/** Run with process.exit mocked to throw, so error paths are assertable. */
async function expectExit1(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = []
  const originalLog = console.log
  const originalErr = console.error
  const originalExit = process.exit
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "))
  }
  console.error = (...args: unknown[]) => {
    logs.push(args.join(" "))
  }
  process.exit = ((code: number) => {
    throw new Error(`process.exit(${code})`)
  }) as never
  try {
    await fn()
    assert.fail("expected process.exit(1)")
  } catch (err) {
    assert.match((err as Error).message, /process\.exit\(1\)/)
  } finally {
    console.log = originalLog
    console.error = originalErr
    process.exit = originalExit
  }
  return logs
}

describe("cli /aspire", () => {
  let tmpDir: string
  let saved: string | undefined

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-aspire-cmd-"))
    saved = process.env.MOMO_CONFIG_DIR
    process.env.MOMO_CONFIG_DIR = tmpDir
  })

  after(() => {
    if (saved === undefined) delete process.env.MOMO_CONFIG_DIR
    else process.env.MOMO_CONFIG_DIR = saved
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function skillsDir(): string {
    return path.join(tmpDir, "skills")
  }

  it("init creates the library skeleton with a lint-clean example", async () => {
    await runAspireCommand(["init"])
    assert.ok(fs.existsSync(path.join(skillsDir(), "README.md")))
    const example = path.join(skillsDir(), "example.md")
    assert.ok(fs.existsSync(example))
    const parsed = parseSkillFile(fs.readFileSync(example, "utf-8"))
    assert.strictEqual(parsed.name, "example")
    assert.strictEqual(parsed.entries.length, 1)
    assert.ok(parsed.entries[0].trigger.length > 0)
    assert.ok(parsed.entries[0].code.includes("clamp"))
    // second init does not overwrite
    const before = fs.readFileSync(example, "utf-8")
    const { logs } = await captureLogs(() => runAspireCommand(["init"]))
    assert.strictEqual(fs.readFileSync(example, "utf-8"), before)
    assert.ok(logs.some((l) => /already initialized|exists/.test(l)))
  })

  it("status --json prints parseable stats", async () => {
    const { logs } = await captureLogs(() => runAspireCommand(["status", "--json"]))
    const stats = JSON.parse(logs.join("\n"))
    assert.match(stats.librarySha, /^[0-9a-f]{16}$/)
    assert.strictEqual(stats.libraryDir, skillsDir())
    assert.ok(Array.isArray(stats.skills))
    assert.strictEqual(stats.skills.length, 1)
    assert.strictEqual(stats.skills[0].name, "example")
    assert.strictEqual(stats.skills[0].entries, 1)
  })

  it("lint on a freshly initialized library exits without errors", async () => {
    const { logs } = await captureLogs(() => runAspireCommand(["lint"]))
    assert.ok(logs.some((l) => /0 error\(s\), 0 warning\(s\)|clean/.test(l)))
  })

  it("lint exits 1 when the library has an error", async () => {
    fs.writeFileSync(
      path.join(skillsDir(), "broken.md"),
      ["## Broken", "", "```ts", "const x: = 1", "```"].join("\n"),
    )
    const logs = await expectExit1(() => runAspireCommand(["lint"]))
    assert.ok(logs.some((l) => /unparseable-fence/.test(l)))
    fs.unlinkSync(path.join(skillsDir(), "broken.md"))
  })

  it("grade validates the report and appends to the ledger", async () => {
    const reportFile = path.join(tmpDir, "skill_report.json")
    fs.writeFileSync(
      reportFile,
      JSON.stringify({
        skillLibrarySha: "b".repeat(16),
        consulted: [
          {
            skill: "example",
            section: "Example",
            verdict: "useful",
            evidence: "the clamp helper solved the task on first attempt",
          },
        ],
        proposedEdits: [],
        proposedNew: [],
      }),
    )
    const { logs } = await captureLogs(() => runAspireCommand(["grade", reportFile]))
    assert.ok(logs.some((l) => /recorded/.test(l) && /grade/.test(l)))
    const ledger = fs.readFileSync(path.join(skillsDir(), "ledger.jsonl"), "utf-8")
    const entry = JSON.parse(ledger.trim().split("\n")[0])
    assert.strictEqual(entry.kind, "grade")
    assert.strictEqual(entry.verdict, "useful")
  })

  it("grade rejects an invalid report with exit 1", async () => {
    const reportFile = path.join(tmpDir, "bad_report.json")
    fs.writeFileSync(
      reportFile,
      JSON.stringify({
        skillLibrarySha: "b".repeat(16),
        consulted: [{ skill: "x", section: "y", verdict: "helpful", evidence: "e" }],
        proposedEdits: [],
        proposedNew: [],
      }),
    )
    const logs = await expectExit1(() => runAspireCommand(["grade", reportFile]))
    assert.ok(logs.some((l) => /verdict/.test(l)))
  })

  it("unknown sub-command prints usage and exits 1", async () => {
    const logs = await expectExit1(() => runAspireCommand(["frobnicate"]))
    assert.ok(logs.some((l) => /Usage:/.test(l)))
    assert.ok(logs.some((l) => /aspire init/.test(l)))
  })
})
