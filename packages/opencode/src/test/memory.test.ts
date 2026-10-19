import { describe, it, before, after, beforeEach } from "node:test"
import assert from "node:assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as http from "http"
import {
  MemoryCapture,
  MemoryClient,
  layerLabel,
  newMemorySessionId,
  recallMemory,
  renderUserMemoryBlock,
  resetMemoryState,
  resolveMemoryConfig,
} from "../memory/index.js"
import type { MemoryConfig, MemoryEntry } from "../memory/types.js"
import {
  memoryAddHandler,
  memoryDeleteHandler,
  memoryListHandler,
  memorySearchHandler,
} from "../pi-extensions/memory.js"

// ---------------------------------------------------------------------------
// Isolation + fixtures
// ---------------------------------------------------------------------------

let tmp: string
let savedConfigDir: string | undefined
const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = [
  "MOMO_CONFIG_DIR",
  "MOMO_MEMORY",
  "MOMO_MEMORY_SERVER_URL",
  "MOMO_MEMORY_SERVER_PORT",
  "MOMO_MEMORY_USER_ID",
  "MOMO_MEMORY_AGENT_ID",
  "MOMO_MEMORY_SESSION_ID",
  "MOMO_MEMORY_MODE",
  "MOMO_MEMORY_PYTHON",
  "MOMO_MEMORY_TOP_K",
  "MOMO_MEMORY_SEARCH_THRESHOLD",
  "MOMO_MEMORY_WRITE_TURN_WINDOW",
  "MOMO_MEMORY_PROFILE_LIMIT",
  "MOMO_MEMORY_PROFILE_MIN_SCORE",
  "HY_MEMORY_HOME",
]

interface Recorded {
  method: string
  url: string
  body: unknown
}

let mock: http.Server
let mockPort: number
let requests: Recorded[] = []
let searchResponse: unknown = { memories: { normal: [] } }

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const chunks: Buffer[] = []
  req.on("data", (c: Buffer) => chunks.push(c))
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf-8")
    const body = raw ? JSON.parse(raw) : undefined
    requests.push({ method: req.method ?? "", url: req.url ?? "", body })

    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(data))
    }
    const url = req.url ?? ""
    if (url === "/healthz") return send(200, { status: "ok" })
    if (url === "/api/v1/add") return send(200, { success: true, memory_id: "mem_1" })
    if (url === "/api/v1/search") return send(200, searchResponse)
    if (url === "/api/v1/list") {
      return send(200, {
        vdb: {
          memories: [{ content: "listed memory", layer: "l2_fact", memory_id: "mem_1" }],
          total: 1,
        },
      })
    }
    if (url === "/api/v1/delete_all") return send(200, { success: true })
    if (/^\/api\/v1\/memories\/mem_1$/.test(url)) {
      if (req.method === "GET") return send(200, { content: "single", memory_id: "mem_1" })
      if (req.method === "PUT") return send(200, { success: true })
      if (req.method === "DELETE") return send(200, { success: true, deleted_count: 1 })
    }
    send(404, { error: "not found" })
  })
}

function testConfig(overrides: Partial<MemoryConfig> = {}): MemoryConfig {
  return {
    enabled: true,
    userId: "test-user",
    agentId: "momo-test",
    sessionId: "default_session",
    mode: "pro",
    serverUrl: `http://127.0.0.1:${mockPort}`,
    serverPort: mockPort,
    autoStartServer: false,
    autoRecall: true,
    autoCapture: true,
    memoryWriteTurnWindow: 3,
    topK: 5,
    searchThreshold: 0.3,
    profileLimit: 5,
    profileMinScore: 0.4,
    pythonPath: "python",
    ...overrides,
  }
}

before(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-memory-"))
  savedConfigDir = process.env.MOMO_CONFIG_DIR
  process.env.MOMO_CONFIG_DIR = tmp
  // Never auto-spawn the Python server in tests.
  fs.writeFileSync(
    path.join(tmp, "momo.jsonc"),
    JSON.stringify({ memory: { autoStartServer: false, userId: "test-user", agentId: "momo-test" } }),
    "utf-8",
  )
  process.env.MOMO_MEMORY_USER_ID = "test-user"
  process.env.MOMO_MEMORY_AGENT_ID = "momo-test"

  mock = http.createServer(handleRequest)
  await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve))
  const address = mock.address()
  mockPort = typeof address === "object" && address ? address.port : 0
  process.env.MOMO_MEMORY_SERVER_URL = `http://127.0.0.1:${mockPort}`
})

after(async () => {
  await new Promise<void>((resolve) => mock.close(() => resolve()))
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  if (savedConfigDir === undefined) delete process.env.MOMO_CONFIG_DIR
  else process.env.MOMO_CONFIG_DIR = savedConfigDir
  fs.rmSync(tmp, { recursive: true, force: true })
})

beforeEach(() => {
  requests = []
  searchResponse = { memories: { normal: [] } }
  resetMemoryState()
})

// ---------------------------------------------------------------------------
// injector
// ---------------------------------------------------------------------------

describe("memory injector", () => {
  it("maps layers to labels", () => {
    assert.strictEqual(layerLabel("l0_basic_info"), "profile")
    assert.strictEqual(layerLabel("L4_IDENTITY"), "profile")
    assert.strictEqual(layerLabel("l6_schema"), "profile")
    assert.strictEqual(layerLabel("l7_intention"), "intent")
    assert.strictEqual(layerLabel("l2_fact"), "")
    assert.strictEqual(layerLabel(undefined), "")
  })

  it("renders the <user_memory> block", () => {
    const entries: MemoryEntry[] = [
      { content: "User prefers TypeScript", layer: "l0_basic_info" },
      { content: "Fixed the timeout bug", layer: "l2_fact" },
    ]
    const block = renderUserMemoryBlock(entries)
    assert.ok(block.startsWith("<user_memory>"))
    assert.ok(block.endsWith("</user_memory>"))
    assert.ok(block.includes("§ [profile] User prefers TypeScript"))
    assert.ok(block.includes("§ Fixed the timeout bug"))
    assert.ok(!block.includes("§ []"))
  })

  it("returns an empty string when there is nothing to inject", () => {
    assert.strictEqual(renderUserMemoryBlock([]), "")
    assert.strictEqual(renderUserMemoryBlock([{ content: "   " }]), "")
  })
})

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

describe("memory config", () => {
  it("applies defaults and momo.jsonc values", () => {
    const cfg = resolveMemoryConfig()
    assert.strictEqual(cfg.userId, "test-user")
    assert.strictEqual(cfg.agentId, "momo-test")
    assert.strictEqual(cfg.autoStartServer, false)
    assert.strictEqual(cfg.mode, "pro")
    assert.strictEqual(cfg.topK, 5)
    assert.strictEqual(cfg.memoryWriteTurnWindow, 5)
  })

  it("lets env vars override the config file", () => {
    process.env.MOMO_MEMORY_TOP_K = "9"
    process.env.MOMO_MEMORY_MODE = "lite"
    try {
      const cfg = resolveMemoryConfig()
      assert.strictEqual(cfg.topK, 9)
      assert.strictEqual(cfg.mode, "lite")
    } finally {
      delete process.env.MOMO_MEMORY_TOP_K
      delete process.env.MOMO_MEMORY_MODE
    }
  })

  it("honours the MOMO_MEMORY kill switch", () => {
    process.env.MOMO_MEMORY = "0"
    try {
      assert.strictEqual(resolveMemoryConfig().enabled, false)
    } finally {
      delete process.env.MOMO_MEMORY
    }
    assert.strictEqual(resolveMemoryConfig().enabled, true)
  })

  it("generates fresh session ids", () => {
    assert.ok(newMemorySessionId().startsWith("mem_"))
  })
})

// ---------------------------------------------------------------------------
// client (against the mock server)
// ---------------------------------------------------------------------------

describe("memory client", () => {
  it("adds text and message traces with the right payloads", async () => {
    const client = new MemoryClient(testConfig())
    const textRes = await client.add("I love TypeScript", { sessionId: "sess_1" })
    assert.strictEqual(textRes?.success, true)
    const msgRes = await client.add([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ])
    assert.strictEqual(msgRes?.success, true)

    const [first, second] = requests
    assert.strictEqual(first.url, "/api/v1/add")
    assert.deepStrictEqual(first.body, {
      text: "I love TypeScript",
      user_id: "test-user",
      agent_id: "momo-test",
      session_id: "sess_1",
      enable_agent: true,
      memory_at: (first.body as Record<string, string>).memory_at,
    })
    assert.ok(Array.isArray((second.body as { messages: unknown[] }).messages))
    assert.strictEqual((second.body as { session_id: string }).session_id, "default_session")
  })

  it("flattens grouped search results in channel order", async () => {
    searchResponse = {
      memories: {
        normal: [{ content: "n1", score: 0.5, memory_id: "a" }],
        profile: [{ content: "p1", score: 0.9, layer: "l0_basic_info", memory_id: "b" }],
        proactive: [{ content: "pr1", score: 0.7, memory_id: "c" }],
      },
    }
    const client = new MemoryClient(testConfig())
    const entries = await client.search("anything")
    assert.deepStrictEqual(
      entries?.map((e) => e.content),
      ["p1", "pr1", "n1"],
    )
    const body = requests[0].body as Record<string, unknown>
    assert.strictEqual(body.query, "anything")
    assert.deepStrictEqual(body.user_ids, ["test-user"])
    assert.strictEqual(body.limit, 5)
    assert.strictEqual(body.min_score, 0.3)
  })

  it("reads the list channel shape", async () => {
    const client = new MemoryClient(testConfig())
    const res = await client.list({ limit: 5, offset: 0 })
    assert.strictEqual(res?.total, 1)
    assert.strictEqual(res?.memories[0].content, "listed memory")
  })

  it("deletes by id", async () => {
    const client = new MemoryClient(testConfig())
    const res = await client.delete("mem_1")
    assert.strictEqual(res?.success, true)
    assert.strictEqual(res?.deleted_count, 1)
    assert.strictEqual(requests[0].method, "DELETE")
  })

  it("returns null instead of throwing when the server is unreachable", async () => {
    const client = new MemoryClient(testConfig({ serverUrl: "http://127.0.0.1:1" }))
    assert.strictEqual(await client.health(), false)
    assert.strictEqual(await client.search("q"), null)
    assert.strictEqual(await client.add("x"), null)
    assert.strictEqual(await client.list(), null)
    assert.strictEqual(await client.delete("mem_1"), null)
  })
})

// ---------------------------------------------------------------------------
// capture (throttled write-back)
// ---------------------------------------------------------------------------

describe("memory capture", () => {
  it("flushes once the turn window is reached", async () => {
    const capture = new MemoryCapture(new MemoryClient(testConfig()), "sess_cap", 3)
    capture.addTurn("u1", "a1")
    await capture.maybeFlush()
    capture.addTurn("u2", "a2")
    await capture.maybeFlush()
    assert.strictEqual(requests.length, 0)
    capture.addTurn("u3", "a3")
    await capture.maybeFlush()
    assert.strictEqual(requests.length, 1)
    assert.strictEqual(requests[0].url, "/api/v1/add")
    const messages = (requests[0].body as { messages: { role: string; content: string }[] }).messages
    assert.strictEqual(messages.length, 6)
    assert.strictEqual((requests[0].body as { session_id: string }).session_id, "sess_cap")

    // After the flush the window restarts and flush() is a no-op when empty.
    await capture.flush()
    assert.strictEqual(requests.length, 1)
  })

  it("flush() writes leftovers and survives server failures", async () => {
    const capture = new MemoryCapture(
      new MemoryClient(testConfig({ serverUrl: "http://127.0.0.1:1" })),
      "sess_err",
      1,
    )
    capture.addTurn("u", "a")
    await capture.flush() // must not throw
    assert.strictEqual(capture.pendingTurns, 0)
  })
})

// ---------------------------------------------------------------------------
// recall facade
// ---------------------------------------------------------------------------

describe("recallMemory", () => {
  it("renders the memory block for matching entries", async () => {
    searchResponse = {
      memories: { normal: [{ content: "User prefers TypeScript", score: 0.8, memory_id: "m1" }] },
    }
    const block = await recallMemory("what does the user prefer?")
    assert.ok(block.includes("<user_memory>"))
    assert.ok(block.includes("User prefers TypeScript"))
  })

  it("returns an empty string when nothing matches or the server is down", async () => {
    assert.strictEqual(await recallMemory("nothing"), "")
    process.env.MOMO_MEMORY_SERVER_URL = "http://127.0.0.1:1"
    resetMemoryState()
    try {
      assert.strictEqual(await recallMemory("anything"), "")
    } finally {
      process.env.MOMO_MEMORY_SERVER_URL = `http://127.0.0.1:${mockPort}`
      resetMemoryState()
    }
  })

  it("returns an empty string when disabled", async () => {
    process.env.MOMO_MEMORY = "0"
    resetMemoryState()
    try {
      assert.strictEqual(await recallMemory("anything"), "")
    } finally {
      delete process.env.MOMO_MEMORY
      resetMemoryState()
    }
  })
})

// ---------------------------------------------------------------------------
// pi extension tool handlers
// ---------------------------------------------------------------------------

describe("memory pi tools", () => {
  it("searches and reports ids", async () => {
    searchResponse = {
      memories: { normal: [{ content: "User prefers TypeScript", score: 0.8, layer: "l2_fact", memory_id: "m1" }] },
    }
    const out = await memorySearchHandler("preferences")
    assert.ok(out.includes("Found 1 memories"))
    assert.ok(out.includes("User prefers TypeScript"))
    assert.ok(out.includes("id: m1"))
  })

  it("stores, lists and deletes", async () => {
    const addOut = await memoryAddHandler("User prefers TypeScript")
    assert.ok(addOut.includes("Stored memory"))
    assert.ok(addOut.includes("mem_1"))

    const listOut = await memoryListHandler(10, 0)
    assert.ok(listOut.includes("listed memory"))

    const delOut = await memoryDeleteHandler("mem_1")
    assert.ok(delOut.includes("Deleted 1 memory(ies)"))
  })

  it("degrades to plain error text when the server is down", async () => {
    process.env.MOMO_MEMORY_SERVER_URL = "http://127.0.0.1:1"
    resetMemoryState()
    try {
      assert.ok((await memorySearchHandler("q")).includes("unavailable"))
      assert.ok((await memoryAddHandler("x")).includes("unavailable"))
    } finally {
      process.env.MOMO_MEMORY_SERVER_URL = `http://127.0.0.1:${mockPort}`
      resetMemoryState()
    }
  })
})
