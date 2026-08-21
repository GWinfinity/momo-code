import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { notify, notifyEnabled, soundEnabled, systemEnabled } from "../notify/index"

// ---------------------------------------------------------------------------
// Isolation (MOMO_CONFIG_DIR → tmp)
// ---------------------------------------------------------------------------

let tmp: string
let savedDir: string | undefined
const saved: Array<[string, string | undefined]> = [
  ["MOMO_NOTIFY", process.env.MOMO_NOTIFY],
  ["MOMO_NOTIFY_SOUND", process.env.MOMO_NOTIFY_SOUND],
  ["MOMO_NOTIFY_SYSTEM", process.env.MOMO_NOTIFY_SYSTEM],
  ["MOMO_NOTIFY_COOLDOWN_MS", process.env.MOMO_NOTIFY_COOLDOWN_MS],
]

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-notify-"))
  savedDir = process.env.MOMO_CONFIG_DIR
  process.env.MOMO_CONFIG_DIR = tmp
})

after(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  if (savedDir === undefined) delete process.env.MOMO_CONFIG_DIR
  else process.env.MOMO_CONFIG_DIR = savedDir
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("notify env rails", () => {
  it("defaults to enabled", () => {
    delete process.env.MOMO_NOTIFY
    delete process.env.MOMO_NOTIFY_SOUND
    delete process.env.MOMO_NOTIFY_SYSTEM
    assert.equal(notifyEnabled(), true)
    assert.equal(soundEnabled(), true)
    assert.equal(systemEnabled(), true)
  })

  it("MOMO_NOTIFY=0 turns everything off", () => {
    process.env.MOMO_NOTIFY = "0"
    assert.equal(notifyEnabled(), false)
    assert.equal(soundEnabled(), false)
    assert.equal(systemEnabled(), false)
  })

  it("per-channel switches", () => {
    delete process.env.MOMO_NOTIFY
    process.env.MOMO_NOTIFY_SOUND = "0"
    process.env.MOMO_NOTIFY_SYSTEM = "false"
    assert.equal(notifyEnabled(), true)
    assert.equal(soundEnabled(), false)
    assert.equal(systemEnabled(), false)
  })
})

describe("notify()", () => {
  it("is a no-op when disabled (no throw, no log)", () => {
    process.env.MOMO_NOTIFY = "0"
    assert.doesNotThrow(() => notify("complete", "t", "b"))
    const file = path.join(tmp, "notifications.jsonl")
    assert.equal(fs.existsSync(file), false)
  })

  it("writes an audit line to notifications.jsonl", () => {
    process.env.MOMO_NOTIFY = "1"
    process.env.MOMO_NOTIFY_SOUND = "0"
    process.env.MOMO_NOTIFY_SYSTEM = "0"
    process.env.MOMO_NOTIFY_COOLDOWN_MS = "1"
    notify("complete", "graph run r1", "已完成 · task")
    notify("error", "graph run r2", "执行失败 · task")
    const file = path.join(tmp, "notifications.jsonl")
    assert.equal(fs.existsSync(file), true)
    const lines = fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean)
    assert.equal(lines.length, 2)
    const first = JSON.parse(lines[0]) as { kind: string; title: string; body: string }
    assert.equal(first.kind, "complete")
    assert.ok(first.title.includes("graph run r1"))
    const second = JSON.parse(lines[1]) as { kind: string }
    assert.equal(second.kind, "error")
  })
})