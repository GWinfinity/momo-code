import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import http from "node:http"
import type { AddressInfo } from "node:net"
import {
  buildStartluxQuestions,
  createBamboonodeBackend,
  mapStartluxAnswer,
  STARTLUX_DEFAULT_MODEL,
  JEVEngine,
  type DecisionQuestion,
  type JEVBackend,
} from "../jev/index"
import {
  createBackendForProvider,
  getJEVEngine,
  getJEVRuntimeConfig,
  JEV_DEFAULTS,
  resetJEVEngine,
  resolveJEVConfig,
} from "../jev/runtime"

const QUESTION: DecisionQuestion = {
  id: "tool-gate",
  context: "Allow this tool call?",
  options: [
    { label: "Allow", value: "allow" },
    { label: "Block", value: "block" },
  ],
}

describe("jev startlux mapping", () => {
  it("maps option questions to choice criteria keyed by value", () => {
    const out = buildStartluxQuestions([QUESTION])
    assert.equal(out["tool-gate"].type, "choice")
    assert.equal(out["tool-gate"].instructions, "Allow this tool call?")
    assert.deepEqual(out["tool-gate"].criteria, { allow: "Allow", block: "Block" })
  })

  it("maps option-less questions to noul", () => {
    const out = buildStartluxQuestions([{ id: "q1", context: "Is it safe?", options: [] }])
    assert.equal(out.q1.type, "noul")
    assert.equal(out.q1.criteria, undefined)
  })

  it("maps a confident choice answer", () => {
    const ans = mapStartluxAnswer(QUESTION, {
      type: "choice",
      choice: "allow",
      confidence: 0.998,
      none_probability: 0.004,
    }, 12)
    assert.equal(ans.chosen, "allow")
    assert.equal(ans.abstained, false)
    assert.equal(ans.confidence, 0.998)
    assert.equal(ans.latencyMs, 12)
  })

  it("abstains on null choice (none of the above)", () => {
    const ans = mapStartluxAnswer(QUESTION, { type: "choice", choice: null }, 5)
    assert.equal(ans.abstained, true)
  })

  it("abstains when none_probability crosses the 0.2 threshold", () => {
    const ans = mapStartluxAnswer(QUESTION, {
      type: "choice",
      choice: "allow",
      confidence: 0.9,
      none_probability: 0.4,
    }, 5)
    assert.equal(ans.abstained, true)
  })

  it("abstains on unlisted option values", () => {
    const ans = mapStartluxAnswer(QUESTION, { type: "choice", choice: "run-as-root" }, 5)
    assert.equal(ans.abstained, true)
  })

  it("maps noul to yes/no with confidence", () => {
    const yes = mapStartluxAnswer({ id: "q", context: "ok?", options: [] }, { noul: 0.8 }, 3)
    assert.equal(yes.chosen, "yes")
    assert.equal(yes.confidence, 0.8)
    const no = mapStartluxAnswer({ id: "q", context: "ok?", options: [] }, { noul: 0.1 }, 3)
    assert.equal(no.chosen, "no")
    assert.equal(no.confidence, 0.9)
  })

  it("abstains on missing raw answer", () => {
    const ans = mapStartluxAnswer(QUESTION, undefined, 0)
    assert.equal(ans.abstained, true)
  })
})

describe("jev bamboonode backend", () => {
  let server: http.Server
  let baseUrl: string
  let lastRequest: { auth?: string; body?: Record<string, unknown> } | undefined
  let respond: (res: http.ServerResponse) => void

  beforeEach(async () => {
    lastRequest = undefined
    respond = (res) => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({
        model: STARTLUX_DEFAULT_MODEL,
        answers: {
          "tool-gate": { type: "choice", choice: "allow", confidence: 0.97, none_probability: 0.01 },
        },
        usage: { input_tokens: 10, output_tokens: 0 },
      }))
    }
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on("data", (c) => chunks.push(c))
      req.on("end", () => {
        lastRequest = {
          auth: req.headers.authorization,
          body: JSON.parse(Buffer.concat(chunks).toString("utf-8")),
        }
        respond(res)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const port = (server.address() as AddressInfo).port
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it("posts a well-formed decisions request and maps the answer", async () => {
    const backend = createBamboonodeBackend({ apiKey: "bk-test", baseUrl })
    const answers = await backend.ask("state text", [QUESTION])

    assert.equal(backend.name, "bamboonode")
    assert.equal(lastRequest?.auth, "Bearer bk-test")
    const body = lastRequest?.body ?? {}
    assert.equal(body.model, STARTLUX_DEFAULT_MODEL)
    assert.equal(body.think_mode, "auto")
    assert.equal(body.state, "state text")
    assert.deepEqual(body.questions, {
      "tool-gate": {
        type: "choice",
        instructions: "Allow this tool call?",
        criteria: { allow: "Allow", block: "Block" },
      },
    })
    assert.equal(answers[0].chosen, "allow")
    assert.equal(answers[0].abstained, false)
  })

  it("abstains on upstream errors", async () => {
    respond = (res) => {
      res.writeHead(500)
      res.end("boom")
    }
    const backend = createBamboonodeBackend({ apiKey: "bk-test", baseUrl })
    const answers = await backend.ask("state", [QUESTION])
    assert.equal(answers[0].abstained, true)
  })

  it("abstains without an api key (no network)", async () => {
    const backend = createBamboonodeBackend({ baseUrl: "http://127.0.0.1:1" })
    const answers = await backend.ask("state", [QUESTION])
    assert.equal(answers[0].abstained, true)
    assert.equal(lastRequest, undefined)
  })
})

describe("jev config resolution", () => {
  let dir: string
  const savedConfigDir = process.env.MOMO_CONFIG_DIR

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-jev-test-"))
    process.env.MOMO_CONFIG_DIR = dir
    resetJEVEngine()
  })

  afterEach(() => {
    if (savedConfigDir === undefined) delete process.env.MOMO_CONFIG_DIR
    else process.env.MOMO_CONFIG_DIR = savedConfigDir
    fs.rmSync(dir, { recursive: true, force: true })
    resetJEVEngine()
  })

  it("returns defaults when nothing is configured", () => {
    const cfg = resolveJEVConfig({})
    assert.equal(cfg.provider, JEV_DEFAULTS.provider)
    assert.equal(cfg.mode, "shadow")
    assert.deepEqual(cfg.gates, ["tool"])
    assert.equal(cfg.apiKey, undefined)
  })

  it("reads the momo.jsonc decision block (jsonc comments stripped)", () => {
    fs.writeFileSync(path.join(dir, "momo.jsonc"), `{
      // JEV decision layer
      "decision": {
        "provider": "bamboonode",
        "model": "startlux-decision-27b-autothink",
        "mode": "enforce",
        "points": ["tool", "diff", "bogus-gate"],
        "deadlineMs": 800,
        "rawLogging": "none"
      }
    }`)
    const cfg = resolveJEVConfig({})
    assert.equal(cfg.provider, "bamboonode")
    assert.equal(cfg.mode, "enforce")
    assert.deepEqual(cfg.gates, ["tool", "diff"])
    assert.equal(cfg.timeoutMs, 800)
    assert.equal(cfg.rawLogging, "none")
  })

  it("gui.json jev section overrides momo.jsonc", () => {
    fs.writeFileSync(path.join(dir, "momo.jsonc"), JSON.stringify({
      decision: { provider: "bamboonode", model: "m-a" },
    }))
    fs.writeFileSync(path.join(dir, "gui.json"), JSON.stringify({
      jev: { provider: "startlux", model: "m-b", baseUrl: "https://relay.example.com", apiKey: "k-1", mode: "off" },
    }))
    const cfg = resolveJEVConfig({})
    assert.equal(cfg.provider, "startlux")
    assert.equal(cfg.model, "m-b")
    assert.equal(cfg.baseUrl, "https://relay.example.com")
    assert.equal(cfg.apiKey, "k-1")
    assert.equal(cfg.mode, "off")
  })

  it("env overrides files and falls back to BAMBOO_API_KEY", () => {
    fs.writeFileSync(path.join(dir, "gui.json"), JSON.stringify({
      jev: { provider: "kev", apiKey: "k-file" },
    }))
    const cfg = resolveJEVConfig({
      MOMO_DECISION_PROVIDER: "bamboonode",
      MOMO_DECISION_MODEL: "startlux-decision-27b-autothink",
      MOMO_DECISION_GATES: "tool,promote,garbage",
      BAMBOO_API_KEY: "k-env",
    })
    assert.equal(cfg.provider, "bamboonode")
    assert.equal(cfg.apiKey, "k-env")
    assert.deepEqual(cfg.gates, ["tool", "promote"])
  })

  it("MOMO_DECISION_API_KEY wins over BAMBOO_API_KEY", () => {
    const cfg = resolveJEVConfig({
      MOMO_DECISION_API_KEY: "k-explicit",
      BAMBOO_API_KEY: "k-bamboo",
    })
    assert.equal(cfg.apiKey, "k-explicit")
  })

  it("getJEVEngine builds a bamboonode backend from config", () => {
    fs.writeFileSync(path.join(dir, "gui.json"), JSON.stringify({
      jev: { provider: "bamboonode", apiKey: "k" },
    }))
    const engine = getJEVEngine()
    assert.equal(engine.getBackendName(), "bamboonode")
    assert.equal(engine.getMode(), "shadow")
    assert.equal(getJEVRuntimeConfig().apiKey, "k")
  })

  it("off mode swaps in the noop backend", () => {
    fs.writeFileSync(path.join(dir, "gui.json"), JSON.stringify({
      jev: { provider: "bamboonode", apiKey: "k", mode: "off" },
    }))
    const engine = getJEVEngine()
    assert.equal(engine.getBackendName(), "noop")
  })
})

describe("jev engine shadow recording", () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-jev-shadow-"))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const fakeBackend = (chosen: string, confidence: number): JEVBackend => ({
    name: "fake",
    ask: async (_ctx, questions) =>
      questions.map((q) => ({
        questionId: q.id,
        chosen,
        confidence,
        abstained: false,
        latencyMs: 1,
      })),
  })

  it("probe records backend answers to the shadow log with redaction", async () => {
    const logPath = path.join(dir, "jev-shadow.jsonl")
    const engine = new JEVEngine({
      backend: fakeBackend("allow", 0.9),
      mode: "shadow",
      gates: ["tool"],
      shadowLog: { path: logPath, rawLogging: "redacted" },
    })

    const answers = await engine.probe(
      "tool",
      'run git push with Authorization: Bearer abcdef1234567890abcdef',
      [QUESTION],
      "allow",
    )

    assert.equal(answers[0].chosen, "allow")
    assert.equal(engine.getRecordCount(), 1)

    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n")
    assert.equal(lines.length, 1)
    const record = JSON.parse(lines[0])
    assert.equal(record.gate, "tool")
    assert.equal(record.backend, "fake")
    assert.equal(record.answer.chosen, "allow")
    assert.equal(record.llmDecision, "allow")
    assert.ok(!record.context.includes("abcdef1234567890abcdef"))
    assert.ok(record.context.includes("[REDACTED]"))
  })

  it("rawLogging=none skips the shadow file", async () => {
    const logPath = path.join(dir, "jev-shadow.jsonl")
    const engine = new JEVEngine({
      backend: fakeBackend("allow", 0.9),
      mode: "shadow",
      gates: ["tool"],
      shadowLog: { path: logPath, rawLogging: "none" },
    })
    await engine.probe("tool", "ctx", [QUESTION], "allow")
    assert.equal(fs.existsSync(logPath), false)
    assert.equal(engine.getRecordCount(), 1)
  })

  it("inactive gates and off mode abstain without asking the backend", async () => {
    let asked = 0
    const counting: JEVBackend = {
      name: "counting",
      ask: async (_c, qs) => {
        asked++
        return qs.map((q) => ({ questionId: q.id, chosen: "x", confidence: 1, abstained: false, latencyMs: 0 }))
      },
    }
    const shadowEngine = new JEVEngine({ backend: counting, mode: "shadow", gates: ["diff"] })
    const res = await shadowEngine.probe("tool", "ctx", [QUESTION], "allow")
    assert.equal(res[0].abstained, true)
    assert.equal(asked, 0)

    const offEngine = new JEVEngine({ backend: counting, mode: "off", gates: ["tool"] })
    const res2 = await offEngine.decide("tool", "ctx", [QUESTION], "allow")
    assert.equal(res2[0].abstained, true)
    assert.equal(asked, 0)
  })

  it("decide() returns the LLM decision in shadow mode", async () => {
    const engine = new JEVEngine({
      backend: fakeBackend("block", 0.99),
      mode: "shadow",
      gates: ["tool"],
    })
    const answers = await engine.decide("tool", "ctx", [QUESTION], "allow")
    assert.equal(answers[0].chosen, "allow")
    assert.equal(answers[0].abstained, true)
  })

  it("decide() applies non-abstained backend answers in enforce mode", async () => {
    const engine = new JEVEngine({
      backend: fakeBackend("block", 0.99),
      mode: "enforce",
      gates: ["tool"],
    })
    const answers = await engine.decide("tool", "ctx", [QUESTION], "allow")
    assert.equal(answers[0].chosen, "block")
    assert.equal(answers[0].abstained, false)
  })

  it("computes ECE over recorded shadow answers", async () => {
    const engine = new JEVEngine({
      backend: fakeBackend("allow", 1.0),
      mode: "shadow",
      gates: ["tool"],
    })
    await engine.probe("tool", "ctx", [QUESTION], "allow")
    assert.equal(engine.getECE(), 0)
  })
})

describe("jev backend factory", () => {
  it("maps providers to backends", () => {
    assert.equal(createBackendForProvider({ ...JEV_DEFAULTS, provider: "bamboonode", apiKey: "k" }).name, "bamboonode")
    assert.equal(createBackendForProvider({ ...JEV_DEFAULTS, provider: "startlux" }).name, "bamboonode")
    assert.equal(createBackendForProvider({ ...JEV_DEFAULTS, provider: "kev", baseUrl: "http://x" }).name, "kev")
    assert.equal(createBackendForProvider({ ...JEV_DEFAULTS, provider: "laya-mlx" }).name, "laya-mlx")
    assert.equal(createBackendForProvider({ ...JEV_DEFAULTS, provider: "typesafe" }).name, "noop")
    assert.equal(createBackendForProvider({ ...JEV_DEFAULTS, provider: "unknown" }).name, "noop")
  })

  it("uses the StartLux default model when the placeholder model is configured", () => {
    const backend = createBackendForProvider({
      ...JEV_DEFAULTS,
      provider: "bamboonode",
      model: JEV_DEFAULTS.model,
      apiKey: "k",
    })
    assert.equal(backend.name, "bamboonode")
  })
})
