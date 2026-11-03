/**
 * Episode replay backend — pi session JSONL listing + parsing.
 *
 * Uses a fixture directory with one pi trajectory, one momo recorder
 * day-file (must be skipped) and one garbage JSONL (must be skipped).
 * PI_CODING_AGENT_DIR redirects pi's getAgentDir() to the fixture, so the
 * scan roots are fully hermetic.
 *
 * @module test/serve-pi-sessions
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { listPiSessions, piSessionRoots, readPiSession } from "../serve/pi-sessions.js"

const PI_SESSION_LINES = [
  JSON.stringify({ type: "session", version: 3, id: "fixt-0001", timestamp: "2026-11-04T10:00:00.000Z", cwd: "D:\\fixture" }),
  JSON.stringify({ type: "model_change", id: "m1", parentId: null, timestamp: "2026-11-04T10:00:01.000Z", provider: "momo", modelId: "test-model" }),
  JSON.stringify({ type: "message", id: "e1", parentId: "m1", timestamp: "2026-11-04T10:00:02.000Z", message: { role: "user", content: [{ type: "text", text: "list the files" }] } }),
  JSON.stringify({ type: "message", id: "e2", parentId: "e1", timestamp: "2026-11-04T10:00:03.000Z", message: { role: "assistant", content: [{ type: "thinking", thinking: "I should call read" }, { type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.txt" } }], usage: { totalTokens: 42 }, stopReason: "toolUse", durationMs: 500 } }),
  JSON.stringify({ type: "message", id: "e3", parentId: "e2", timestamp: "2026-11-04T10:00:04.000Z", message: { role: "toolResult", toolCallId: "call_1", toolName: "read", content: [{ type: "text", text: "file contents" }], isError: false, durationMs: 12 } }),
  JSON.stringify({ type: "compaction", id: "c1", parentId: "e3", timestamp: "2026-11-04T10:00:05.000Z" }),
]

describe("serve/pi-sessions", () => {
  const origConfigDir = process.env.MOMO_CONFIG_DIR
  const origAgentDir = process.env.PI_CODING_AGENT_DIR
  let tmp: string
  let sessionFile: string
  let newerFile: string

  function setup(): void {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-pi-sessions-"))
    process.env.MOMO_CONFIG_DIR = tmp
    process.env.PI_CODING_AGENT_DIR = path.join(tmp, "piagent")
    // root 1: momo home sessions — contains a pi session, a recorder day-file and garbage
    const momoSess = path.join(tmp, "sessions")
    fs.mkdirSync(momoSess, { recursive: true })
    sessionFile = path.join(momoSess, "2026-11-04T10-00-00-000Z_fixt-0001.jsonl")
    fs.writeFileSync(sessionFile, PI_SESSION_LINES.join("\n") + "\n", "utf-8")
    fs.writeFileSync(path.join(momoSess, "2026-11-04.jsonl"), JSON.stringify({ id: "ses_rec", ts: "2026-11-04T09:00:00.000Z", provider: "graph", prompt: "p", response: "r", exitCode: 0, durationMs: 1, rlmDepth: 0 }) + "\n", "utf-8")
    fs.writeFileSync(path.join(momoSess, "garbage.jsonl"), "not json at all\n", "utf-8")
    // root 2: pi >= 1.4.0 layout — sessions under an encoded-cwd subdir
    const piSess = path.join(tmp, "piagent", "sessions", "D--fixture")
    fs.mkdirSync(piSess, { recursive: true })
    newerFile = path.join(piSess, "2026-11-04T11-00-00-000Z_fixt-0002.jsonl")
    fs.writeFileSync(
      newerFile,
      JSON.stringify({ type: "session", version: 3, id: "fixt-0002", timestamp: "2026-11-04T11:00:00.000Z", cwd: "D:\\fixture" }) + "\n" +
      JSON.stringify({ type: "message", id: "f1", parentId: null, timestamp: "2026-11-04T11:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "hi" }] } }) + "\n",
      "utf-8",
    )
  }

  function teardown(): void {
    if (origConfigDir === undefined) delete process.env.MOMO_CONFIG_DIR
    else process.env.MOMO_CONFIG_DIR = origConfigDir
    if (origAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = origAgentDir
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  it("exposes momo sessions dir and pi agent sessions dir as roots", () => {
    setup()
    try {
      const roots = piSessionRoots()
      assert.equal(roots.length, 2)
      assert.ok(roots[0].includes(path.join(tmp, "sessions")))
      assert.ok(roots[1].includes(path.join(tmp, "piagent", "sessions")))
    } finally {
      teardown()
    }
  })

  it("lists only pi sessions (skips recorder day-files and garbage), newest first", () => {
    setup()
    try {
      const sessions = listPiSessions()
      assert.equal(sessions.length, 2)
      assert.equal(sessions[0].id, "fixt-0002") // newer mtime first
      assert.equal(sessions[1].id, "fixt-0001")
      assert.equal(sessions[1].cwd, "D:\\fixture")
      assert.ok(sessions[1].sizeBytes > 0)
      const names = sessions.map((s) => s.file)
      assert.ok(!names.some((n) => n.startsWith("2026-11-04.jsonl")), "recorder day-file skipped")
      assert.ok(!names.includes("garbage.jsonl"), "garbage skipped")
    } finally {
      teardown()
    }
  })

  it("parses a session into a normalized replay timeline with stats", () => {
    setup()
    try {
      const [session] = listPiSessions().filter((s) => s.id === "fixt-0001")
      const detail = readPiSession(session.key)
      assert.equal(detail.id, "fixt-0001")
      assert.equal(detail.cwd, "D:\\fixture")
      assert.equal(detail.entries.length, 6)
      const [header, model, user, assistant, toolResult, compaction] = detail.entries
      assert.equal(header.kind, "session")
      assert.equal(model.kind, "model")
      assert.equal(model.model, "test-model")
      assert.equal(user.role, "user")
      assert.equal(user.text, "list the files")
      assert.equal(assistant.role, "assistant")
      assert.equal(assistant.thinking, "I should call read")
      assert.equal(assistant.toolCalls?.[0].name, "read")
      assert.deepEqual(assistant.toolCalls?.[0].args, { path: "a.txt" })
      assert.equal(assistant.tokens, 42)
      assert.equal(assistant.durationMs, 500)
      assert.equal(toolResult.role, "toolResult")
      assert.equal(toolResult.toolName, "read")
      assert.equal(toolResult.toolCallId, "call_1")
      assert.equal(toolResult.isError, undefined)
      assert.equal(toolResult.text, "file contents")
      assert.equal(compaction.kind, "compaction")
      assert.deepEqual(detail.stats, {
        messages: 3,
        toolCalls: 1,
        tokens: 42,
        firstTs: "2026-11-04T10:00:00.000Z",
        lastTs: "2026-11-04T10:00:05.000Z",
      })
    } finally {
      teardown()
    }
  })

  it("tolerates a trailing partial line", () => {
    setup()
    try {
      const momoSess = path.join(tmp, "sessions")
      fs.writeFileSync(
        path.join(momoSess, "partial.jsonl"),
        JSON.stringify({ type: "session", id: "fixt-partial", timestamp: "2026-11-04T12:00:00.000Z" }) + "\n" +
          `{"type":"message","id":"x","message":{"role":"user","content":[{"type":"text","text":"trunca`,
        "utf-8",
      )
      const detail = readPiSession(listPiSessions().find((s) => s.id === "fixt-partial")!.key)
      assert.equal(detail.entries.length, 1)
    } finally {
      teardown()
    }
  })

  it("rejects keys that escape the scan roots or miss the file", () => {
    setup()
    try {
      const outside = Buffer.from(path.join(tmp, "secret.jsonl"), "utf-8").toString("base64url")
      assert.throws(() => readPiSession(outside), /outside the session directories/)
      const missing = Buffer.from(path.join(tmp, "sessions", "nope.jsonl"), "utf-8").toString("base64url")
      assert.throws(() => readPiSession(missing), /not found/)
    } finally {
      teardown()
    }
  })

  it("refuses to read a non-pi JSONL even if it lives in a root", () => {
    setup()
    try {
      const recorder = Buffer.from(path.join(tmp, "sessions", "2026-11-04.jsonl"), "utf-8").toString("base64url")
      assert.throws(() => readPiSession(recorder), /not a pi session file/)
    } finally {
      teardown()
    }
  })
})
