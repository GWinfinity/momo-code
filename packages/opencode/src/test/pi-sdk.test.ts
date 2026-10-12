import { describe, it } from "node:test"
import assert from "node:assert"
import fs from "fs"
import os from "os"
import path from "path"
import {
  DefaultResourceLoader, SettingsManager, type ExtensionFactory,
} from "@earendil-works/pi-coding-agent"
import * as factories from "../pi-extensions/index.js"

async function load(factories: ExtensionFactory[]) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-sdk-"))
  try {
    const loader = new DefaultResourceLoader({
      cwd: tmp, agentDir: tmp, settingsManager: SettingsManager.inMemory(),
      noExtensions: true, noSkills: true, noPromptTemplates: true,
      noThemes: true, noContextFiles: true, extensionFactories: factories,
    })
    await loader.reload()
    const result = loader.getExtensions()
    assert.deepStrictEqual(result.errors, [])
    assert.strictEqual(result.extensions.length, factories.length)
    return result.extensions
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

describe("Pi SDK extensions", () => {
  it("loads all six factories with the SDK's actual loader", async () => {
    const extensions = await load(Object.values(factories).filter((value) => typeof value === "function"))
    assert.strictEqual(extensions.length, 6)
    for (const extension of extensions) assert.ok(extension.handlers.size > 0)
  })

  it("requires UI approval for writes and dangerous commands, while allowing reads", async () => {
    const [extension] = await load([factories.permissionsExtension])
    const handler = extension.handlers.get("tool_call")?.[0]
    assert.ok(handler)
    const context = { hasUI: false, ui: { confirm: async () => { throw new Error("no UI") } } }
    for (const event of [
      { type: "tool_call", toolName: "write", input: { path: "fixture.txt", content: "test" } },
      { type: "tool_call", toolName: "bash", input: { command: "rm -rf /tmp/momo-fixture" } },
    ]) {
      assert.deepStrictEqual(await handler(event, context), {
        block: true, reason: "Operation requires interactive approval",
      })
    }
    assert.strictEqual(await handler({ toolName: "read", input: { path: "fixture.txt" } }, context), undefined)
    assert.strictEqual(await handler({ toolName: "bash", input: { command: "pwd" } }, context), undefined)
  })

  it("uses the SDK confirmation result to allow or block a write", async () => {
    const [extension] = await load([factories.permissionsExtension])
    const handler = extension.handlers.get("tool_call")?.[0]
    assert.ok(handler)
    const event = { type: "tool_call", toolName: "edit", input: { path: "fixture.txt", edits: [] } }
    assert.deepStrictEqual(await handler(event, { hasUI: true, ui: { confirm: async () => false } }), {
      block: true, reason: "User declined",
    })
    assert.strictEqual(await handler(event, { hasUI: true, ui: { confirm: async () => true } }), undefined)
  })

  it("records tool verdicts and settlement in the configured momo directory", async () => {
    const [extension] = await load([factories.rsiExtension])
    const tool = extension.handlers.get("tool_result")?.[0]
    const settled = extension.handlers.get("agent_settled")?.[0]
    assert.ok(tool && settled)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-sdk-rsi-"))
    const saved = process.env.MOMO_CONFIG_DIR
    process.env.MOMO_CONFIG_DIR = tmp
    try {
      const context = { sessionManager: { getSessionId: () => "fixture-session" } }
      await tool({ toolName: "bash", toolCallId: "fixture-call", structuredContent: { exit_code: 1 }, isError: false }, context)
      await settled({ aborted: true }, context)
      const signal = JSON.parse(fs.readFileSync(path.join(tmp, "experience", "ledger.jsonl"), "utf8"))
      assert.strictEqual(signal.verdict, "fail")
      assert.strictEqual(signal.exitCode, 1)
      assert.strictEqual(signal.sessionId, "fixture-session")
      const metric = JSON.parse(fs.readFileSync(path.join(tmp, "rsi-metrics.jsonl"), "utf8"))
      assert.strictEqual(metric.agentOutcome, "abandoned")
      assert.strictEqual(metric.sessionId, "fixture-session")
    } finally {
      if (saved === undefined) delete process.env.MOMO_CONFIG_DIR
      else process.env.MOMO_CONFIG_DIR = saved
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
