import { describe, it } from "node:test"
import assert from "node:assert"
import { spawnSync, execSync } from "node:child_process"
import { runCli } from "../cli/index.js"

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const original = console.log
  const logs: string[] = []
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  }
  try {
    await fn()
  } finally {
    console.log = original
  }
  return logs.join("\n")
}

function runHelp(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MOMO_API_KEY: "" },
  })
  return result
}

describe("runCli help", () => {
  // v2.0: no-args starts the interactive REPL, so help is only reachable
  // through the help flags. (`runCli([])` would open the REPL and hang.)
  for (const flag of ["help", "--help", "-h"]) {
    it(`shows help for '${flag}'`, async () => {
      const output = await captureStdout(() => runCli([flag]))
      assert(output.includes("USAGE:"))
      assert(output.includes("momo <prompt>"))
    })
  }
})

describe("bin/momo --help", () => {
  it("prints help without requiring an API key", () => {
    const result = runHelp("node", ["bin/momo", "--help"])
    assert.strictEqual(result.status, 0, result.stderr || result.stdout)
    assert(result.stdout.includes("The coding agent that evolves"))
    assert(result.stdout.includes("DESCRIPTION:"))
    assert(result.stdout.includes("USAGE:"))
  })
})

describe("src/cli/main.ts --help", () => {
  it("prints help without requiring an API key", () => {
    const stdout = execSync("npx tsx src/cli/main.ts --help", {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, MOMO_API_KEY: "" },
    })
    assert(stdout.includes("DESCRIPTION:"))
    assert(stdout.includes("USAGE:"))
  })
})
