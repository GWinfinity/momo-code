// SPDX-License-Identifier: MIT
// Tests for the Julia-1 local JEV backend (packages/opencode/src/jev/julia.ts)

import { describe, it } from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  answersFromLogits,
  createJuliaBackend,
  createJuliaBackendFromEnv,
  juliaRow,
  softmax,
} from "../jev/julia.js"

const QUESTION = {
  id: "tool-gate",
  context: "Should this tool call be allowed?",
  options: [
    { label: "Allow: standard operation", value: "allow" },
    { label: "Confirm: needs user review", value: "confirm" },
    { label: "Block: dangerous operation", value: "block" },
  ],
}

describe("Julia backend — pure mapping", () => {
  it("softmax is normalized and peaks at the max logit", () => {
    const probs = softmax([1, 2, 3])
    assert.strictEqual(probs[2], Math.max(...probs))
    assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-9)
    assert.deepStrictEqual(softmax([0, 0]), [0.5, 0.5])
  })

  it("maps winning index to option value, not label", () => {
    const [ans] = answersFromLogits([QUESTION], [[0.1, 0.2, 5.0]], 12, 0.55)
    assert.strictEqual(ans.questionId, "tool-gate")
    assert.strictEqual(ans.chosen, "block")
    assert.strictEqual(ans.abstained, false)
    assert.strictEqual(ans.latencyMs, 12)
    assert.ok(ans.confidence > 0.9)
  })

  it("abstains when confidence is below the threshold", () => {
    const [ans] = answersFromLogits([QUESTION], [[0.0, 0.05, 0.051]], 7, 0.55)
    assert.strictEqual(ans.chosen, "abstain")
    assert.strictEqual(ans.abstained, true)
    assert.ok(ans.confidence < 0.55)
  })

  it("abstains when the option count is outside the 2-20 model contract", () => {
    const one = { ...QUESTION, options: QUESTION.options.slice(0, 1) }
    const [ans] = answersFromLogits([one], [[5.0]], 3, 0.55)
    assert.strictEqual(ans.abstained, true)
  })

  it("builds Julia request rows with label text and choice type", () => {
    const row = juliaRow("ctx", QUESTION)
    assert.strictEqual(row.state, "ctx")
    assert.strictEqual(row.question, QUESTION.context)
    assert.strictEqual(row.type, "choice")
    assert.deepStrictEqual(row.options, QUESTION.options.map((o) => o.label))
  })
})

describe("Julia backend — JEVBackend contract", () => {
  it("answers via injected internals", async () => {
    const backend = createJuliaBackend({
      modelPath: "/nonexistent",
      abstainThreshold: 0.5,
      warmup: false,
      internals: {
        run: async () => [[0.1, 0.2, 3.0]],
      },
    })
    assert.strictEqual(backend.name, "julia")
    const answers = await backend.ask("state", [QUESTION])
    assert.strictEqual(answers[0].chosen, "block")
    assert.strictEqual(answers[0].abstained, false)
  })

  it("abstains everything instead of throwing when inference fails", async () => {
    const backend = createJuliaBackend({
      modelPath: "/nonexistent",
      warmup: false,
      internals: {
        run: async () => {
          throw new Error("session exploded")
        },
      },
    })
    const answers = await backend.ask("state", [QUESTION])
    assert.strictEqual(answers.length, 1)
    assert.strictEqual(answers[0].chosen, "abstain")
    assert.strictEqual(answers[0].abstained, true)
  })

  it("handles an empty question list", async () => {
    const backend = createJuliaBackend({
      modelPath: "/nonexistent",
      warmup: false,
      internals: { run: async () => [] },
    })
    assert.deepStrictEqual(await backend.ask("state", []), [])
  })
})

describe("Julia backend — env factory", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-julia-test-"))

  it("returns null when provider is not julia", () => {
    assert.strictEqual(createJuliaBackendFromEnv({ MOMO_DECISION_PROVIDER: "noop" }, tmp), null)
    assert.strictEqual(createJuliaBackendFromEnv({}, tmp), null)
  })

  it("builds a backend with default model dir under the config dir", () => {
    const backend = createJuliaBackendFromEnv({ MOMO_DECISION_PROVIDER: "julia" }, tmp)
    assert.ok(backend)
    assert.strictEqual(backend.name, "julia")
  })

  it("honors MOMO_JULIA_MODEL_PATH and abstain threshold overrides", () => {
    const backend = createJuliaBackendFromEnv(
      {
        MOMO_DECISION_PROVIDER: "julia-onnx",
        MOMO_JULIA_MODEL_PATH: "/custom/model/dir",
        MOMO_JULIA_ABSTAIN_THRESHOLD: "0.7",
      },
      tmp,
    )
    assert.ok(backend)
  })
})

describe("Julia backend — real model smoke", () => {
  const modelDir = path.join(
    process.env.MOMO_HOME || path.join(os.homedir(), ".momo"),
    "models",
    "julia-1",
  )

  it("decides an obvious tool-gate question", { skip: !fs.existsSync(path.join(modelDir, "model.onnx")) }, async () => {
    const backend = createJuliaBackend({ modelPath: modelDir, abstainThreshold: 0.55 })
    const answers = await backend.ask(
      "Agent wants to run: rm -rf / on the whole disk, no user confirmation requested.",
      [
        {
          id: "tool-gate",
          context: "Should this agent tool call be allowed to run without human review?",
          options: [
            { label: "Allow: standard operation", value: "allow" },
            { label: "Block: dangerous operation", value: "block" },
          ],
        },
      ],
    )
    assert.strictEqual(answers.length, 1)
    assert.strictEqual(answers[0].chosen, "block")
    assert.strictEqual(answers[0].abstained, false)
    assert.ok(answers[0].confidence > 0.55)
    assert.ok(answers[0].latencyMs > 0)
  })
})
