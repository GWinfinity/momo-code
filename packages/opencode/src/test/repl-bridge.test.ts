import { describe, it } from "node:test"
import assert from "node:assert"
import { tokenize } from "../cli/cmd/repl.js"
import { dispatchCommand } from "../cli/dispatch.js"

describe("tokenize", () => {
  it("splits plain whitespace-separated input", () => {
    assert.deepStrictEqual(tokenize("graph list --json"), ["graph", "list", "--json"])
  })

  it("keeps quoted task prompts together", () => {
    assert.deepStrictEqual(tokenize('graph run "fix the auth bug" --max-nodes=4'), [
      "graph",
      "run",
      "fix the auth bug",
      "--max-nodes=4",
    ])
  })

  it("supports single quotes", () => {
    assert.deepStrictEqual(tokenize("agent 'refactor the parser'"), [
      "agent",
      "refactor the parser",
    ])
  })

  it("handles empty and blank input", () => {
    assert.deepStrictEqual(tokenize(""), [])
    assert.deepStrictEqual(tokenize("   "), [])
  })

  it("handles adjacent quoted and bare tokens", () => {
    assert.deepStrictEqual(tokenize('evolve --mode="explore hard"'), [
      "evolve",
      "--mode=explore hard",
    ])
  })
})

describe("dispatchCommand fallback", () => {
  it("returns false for unrecognized commands", async () => {
    assert.strictEqual(await dispatchCommand("__definitely_not_a_command__", []), false)
  })

  it("returns false for unrecognized slash commands", async () => {
    assert.strictEqual(await dispatchCommand("/__definitely_not_a_command__", []), false)
  })
})
