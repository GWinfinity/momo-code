import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
  judgeVerdict,
  assertCheckAllowed,
  buildVerificationPrompt,
} from "../skill/verifier"

describe("skill/verifier judgeVerdict", () => {
  it("verified when all trials pass", () => {
    assert.strictEqual(
      judgeVerdict([
        { pass: true, errored: false },
        { pass: true, errored: false },
      ]),
      "verified",
    )
  })

  it("verified on a single pass (1/1 coding-task criterion)", () => {
    assert.strictEqual(judgeVerdict([{ pass: true, errored: false }]), "verified")
  })

  it("verified on 2-of-3 (majority)", () => {
    assert.strictEqual(
      judgeVerdict([
        { pass: true, errored: false },
        { pass: true, errored: false },
        { pass: false, errored: false },
      ]),
      "verified",
    )
  })

  it("refuted on 1-of-3 (below the majority)", () => {
    assert.strictEqual(
      judgeVerdict([
        { pass: true, errored: false },
        { pass: false, errored: false },
        { pass: false, errored: false },
      ]),
      "refuted",
    )
  })

  it("treats 1-of-2 as verified (passes >= ceil(trials/2))", () => {
    assert.strictEqual(
      judgeVerdict([
        { pass: true, errored: false },
        { pass: false, errored: false },
      ]),
      "verified",
    )
  })

  it("refuted when some trials errored but not all", () => {
    assert.strictEqual(
      judgeVerdict([
        { pass: false, errored: true },
        { pass: false, errored: false },
      ]),
      "refuted",
    )
  })

  it("void when every trial errored", () => {
    assert.strictEqual(
      judgeVerdict([
        { pass: false, errored: true },
        { pass: false, errored: true },
      ]),
      "void",
    )
  })

  it("void on an empty run", () => {
    assert.strictEqual(judgeVerdict([]), "void")
  })
})

describe("skill/verifier guards & prompt", () => {
  let tmpDir: string

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-skill-verify-"))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("accepts whitelisted check commands", () => {
    assertCheckAllowed("npm test")
    assertCheckAllowed("npx tsc --noEmit")
    assertCheckAllowed("node --check solution.js")
  })

  it("rejects check commands outside the whitelist", () => {
    assert.throws(() => assertCheckAllowed("rm -rf /"), /not in whitelist/)
    assert.throws(() => assertCheckAllowed("bash exploit.sh"), /not in whitelist/)
  })

  it("builds a self-contained prompt with prohibitions and the TASK-FAILED contract", () => {
    const libDir = path.join(tmpDir, "skills")
    fs.mkdirSync(libDir, { recursive: true })
    fs.writeFileSync(
      path.join(libDir, "arrays.md"),
      "## Quantiles\n\n```ts\nfunction quantile(xs: number[], p: number): number { return p }\n```\n",
    )
    const proposal = path.join(tmpDir, "proposal.md")
    fs.writeFileSync(proposal, "## Proposed\n\n### New entry\n\n```ts\nconst x = 1\n```\n")
    const task = {
      id: "median-1",
      prompt: "Implement a median function.",
      check: "npm test",
      band: "dev" as const,
    }

    const prompt = buildVerificationPrompt({ libraryDir: libDir, proposalFile: proposal, task })
    // library content inlined
    assert.match(prompt, /arrays\.md/)
    assert.match(prompt, /function quantile/)
    // proposal inlined
    assert.match(prompt, /New entry/)
    // task inlined
    assert.match(prompt, /Implement a median function\./)
    assert.match(prompt, /npm test/)
    // prohibitions + failure contract
    assert.match(prompt, /Do NOT read any files under skill-campaigns\//)
    assert.match(prompt, /TASK-FAILED/)
  })
})
