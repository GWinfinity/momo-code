// SPDX-License-Identifier: MIT
// momo JEV — Julia-1 local decision backend (pure Node)
//
// Runs SupersonicLabs/Julia-1 (144.3M decision model, Apache-2.0) via
// onnxruntime-node CPU inference + the model's official Rust/WASM tokenizer.
// No Python, no external service. Model files (model.onnx, model.onnx.data,
// tokenizer.json, wasm/) download once to the model directory — see
// scripts/download-julia-model.mjs.
//
// Mapping to the JEV contract:
//   ask(context, questions) → state = context, question = question.context,
//   Julia option text = option.label, DecisionAnswer.chosen = option.value,
//   confidence = raw max softmax probability (kept un-rounded for ECE).

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { DecisionAnswer, DecisionQuestion, JEVBackend } from "./index.js"

export interface JuliaBackendOptions {
  /** Directory containing model.onnx, model.onnx.data, tokenizer.json and wasm/. */
  modelPath: string
  /** Combined sequence budget (Julia default 1024, supports up to 8192). */
  maxLength?: number
  /** Question + options token budget (Julia default 256). */
  headLength?: number
  /** Reject requests containing the model's reserved marker token. */
  strictEncoding?: boolean
  /** Questions whose best probability is below this abstain (default 0.55). */
  abstainThreshold?: number
  /** Run one dummy inference at init to warm the session (default true). */
  warmup?: boolean
  /** Test hook: override internals loading (session + encoder). */
  internals?: JuliaInternals
}

interface SerializedRow {
  ids: number[]
  markers: number[]
  qtype: number
}

/** Un-encoded decision request — what `run` accepts; encoding happens inside. */
interface JuliaRequestRow {
  state: string
  question: string
  options: string[]
  type: keyof typeof QTYPES
}

interface WasmEncoderLike {
  encode(requestJson: string, maxLength: number, headLength: number, strict: boolean): string
}

interface JuliaInternals {
  run(rows: JuliaRequestRow[]): Promise<number[][]>
}

const QTYPES = { choice: 0, score: 1, noul: 2 } as const
const MIN_OPTIONS = 2
const MAX_OPTIONS = 20

/** Softmax over raw logits; returns raw probabilities (no display rounding). */
export function softmax(logits: number[]): number[] {
  const peak = Math.max(...logits)
  const weights = logits.map((x) => Math.exp(x - peak))
  const total = weights.reduce((a, b) => a + b, 0)
  return weights.map((x) => x / total)
}

/** Pure mapping from per-question logits to JEV answers. Exported for tests. */
export function answersFromLogits(
  questions: DecisionQuestion[],
  logits: number[][],
  latencyMs: number,
  abstainThreshold: number,
): DecisionAnswer[] {
  return questions.map((q, i) => {
    const values = logits[i] ?? []
    if (q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS || values.length < q.options.length) {
      return { questionId: q.id, chosen: "abstain", confidence: 0, abstained: true, latencyMs }
    }
    const probs = softmax(values.slice(0, q.options.length))
    const winner = probs.indexOf(Math.max(...probs))
    const confidence = probs[winner]
    if (confidence < abstainThreshold) {
      return { questionId: q.id, chosen: "abstain", confidence, abstained: true, latencyMs }
    }
    return { questionId: q.id, chosen: q.options[winner].value, confidence, abstained: false, latencyMs }
  })
}

/** Build the Julia request row for one JEV question. Exported for tests. */
export function juliaRow(
  state: string,
  q: DecisionQuestion,
): JuliaRequestRow {
  const options = q.options.map((o) => o.label)
  return { state, question: q.context, options, type: "choice" }
}

async function loadInternals(opts: JuliaBackendOptions): Promise<JuliaInternals> {
  const maxLength = opts.maxLength ?? 1024
  const headLength = opts.headLength ?? 256
  const strict = opts.strictEncoding ?? true

  const ort = await import("onnxruntime-node")
  const session = await ort.InferenceSession.create(path.join(opts.modelPath, "model.onnx"))

  // Official wasm-bindgen tokenizer glue shipped with the ONNX export.
  const gluePath = path.join(opts.modelPath, "wasm", "julia_webgpu_encode.js")
  const wasmPath = path.join(opts.modelPath, "wasm", "julia_webgpu_encode_bg.wasm")
  const glue = (await import(pathToFileURL(gluePath).href)) as {
    default: (init: { module_or_path: Buffer }) => Promise<unknown>
    WasmEncoder: new (tokenizerJson: string) => WasmEncoderLike
  }
  await glue.default({ module_or_path: fs.readFileSync(wasmPath) })
  const tokenizerJson = fs.readFileSync(path.join(opts.modelPath, "tokenizer.json"), "utf8")
  const encoder = new glue.WasmEncoder(tokenizerJson)

  return {
    async run(rows: JuliaRequestRow[]): Promise<number[][]> {
      if (rows.length === 0) return []
      const items = rows.map((row) =>
        JSON.parse(encoder.encode(JSON.stringify(row), maxLength, headLength, strict)) as SerializedRow,
      )
      const batch = items.length
      const length = Math.ceil(Math.max(...items.map((x) => x.ids.length)) / 8) * 8
      const count = Math.max(...items.map((x) => x.markers.length))
      const ids = new BigInt64Array(batch * length)
      const attention = new BigInt64Array(batch * length)
      const positions = new BigInt64Array(batch * count)
      const mask = new Uint8Array(batch * count)
      const qtype = new BigInt64Array(batch)
      items.forEach((item, i) => {
        item.ids.forEach((id, j) => {
          ids[i * length + j] = BigInt(id)
          attention[i * length + j] = 1n
        })
        item.markers.forEach((pos, j) => {
          positions[i * count + j] = BigInt(pos)
          mask[i * count + j] = 1
        })
        qtype[i] = BigInt(item.qtype)
      })
      const output = await session.run({
        input_ids: new ort.Tensor("int64", ids, [batch, length]),
        attention_mask: new ort.Tensor("int64", attention, [batch, length]),
        marker_pos: new ort.Tensor("int64", positions, [batch, count]),
        marker_mask: new ort.Tensor("bool", mask, [batch, count]),
        qtype: new ort.Tensor("int64", qtype, [batch]),
      })
      const values = output.logits.data as Float32Array
      return items.map((item, i) => Array.from(values.slice(i * count, i * count + item.markers.length)))
    },
  }
}

/**
 * Julia-1 backend. Respects the JEVBackend contract: never throws, abstains
 * on contract violations (option count outside 2–20, encoding overflow).
 */
export function createJuliaBackend(opts: JuliaBackendOptions): JEVBackend {
  const abstainThreshold = opts.abstainThreshold ?? 0.55
  const warmup = opts.warmup ?? true
  let internals: Promise<JuliaInternals> | null = null
  const load = () => (internals ??= Promise.resolve(opts.internals ?? loadInternals(opts)))

  if (warmup && !opts.internals) {
    void load()
      .then((i) => i.run([{ state: "", question: "Ready?", options: ["Yes", "No"], type: "choice" }]))
      .catch(() => {
        internals = null
      })
  }

  return {
    name: "julia",
    async ask(context, questions) {
      const started = Date.now()
      try {
        const core = await load()
        const rows = questions.map((q) => juliaRow(context, q))
        const logits = await core.run(rows)
        return answersFromLogits(questions, logits, Date.now() - started, abstainThreshold)
      } catch (err) {
        internals = null
        console.warn("[JEV-JULIA] inference failed, abstaining:", err)
        return questions.map((q) => ({
          questionId: q.id,
          chosen: "abstain",
          confidence: 0,
          abstained: true,
          latencyMs: Date.now() - started,
        }))
      }
    },
  }
}

/** Resolve the Julia backend from the environment (null when not selected). */
export function createJuliaBackendFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  configDir?: string,
): JEVBackend | null {
  const provider = (env.MOMO_DECISION_PROVIDER || "").toLowerCase()
  if (provider !== "julia" && provider !== "julia-onnx") return null
  const modelPath =
    env.MOMO_JULIA_MODEL_PATH || path.join(configDir ?? defaultConfigDir(), "models", "julia-1")
  const abstainThreshold = env.MOMO_JULIA_ABSTAIN_THRESHOLD
    ? Number(env.MOMO_JULIA_ABSTAIN_THRESHOLD)
    : undefined
  return createJuliaBackend({
    modelPath,
    abstainThreshold: abstainThreshold !== undefined && !Number.isNaN(abstainThreshold) ? abstainThreshold : undefined,
  })
}

function defaultConfigDir(): string {
  return process.env.MOMO_HOME || path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".momo")
}
