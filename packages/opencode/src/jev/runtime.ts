// SPDX-License-Identifier: MIT
// momo JEV runtime wiring — config resolution + engine singleton
// Priority: env > gui.json (desktop settings) > momo.jsonc (decision block) > defaults

import fs from "fs"
import path from "path"
import { getConfigDir } from "../config/config.js"
import {
  createBamboonodeBackend,
  createKevBackend,
  createLayaBackend,
  createNoopBackend,
  JEVEngine,
  STARTLUX_DEFAULT_MODEL,
  type DecisionGate,
  type JEVBackend,
  type JEVRawLogging,
} from "./index.js"

export interface JEVRuntimeConfig {
  provider: string
  model: string
  mode: "shadow" | "enforce" | "off"
  gates: DecisionGate[]
  timeoutMs: number
  baseUrl?: string
  apiKey?: string
  rawLogging: JEVRawLogging
}

export const JEV_DEFAULTS: JEVRuntimeConfig = {
  provider: "typesafe",
  model: "jev-1.13.0",
  mode: "shadow",
  gates: ["tool"],
  timeoutMs: 1500,
  rawLogging: "redacted",
}

const VALID_GATES: readonly DecisionGate[] = ["tool", "tactic", "route", "diff", "promote"]

function isGate(value: unknown): value is DecisionGate {
  return typeof value === "string" && (VALID_GATES as readonly string[]).includes(value)
}

function isMode(value: unknown): value is "shadow" | "enforce" | "off" {
  return value === "shadow" || value === "enforce" || value === "off"
}

function isRawLogging(value: unknown): value is JEVRawLogging {
  return value === "full" || value === "redacted" || value === "none"
}

function readJsonc(file: string): Record<string, unknown> | undefined {
  try {
    const content = fs.readFileSync(file, "utf-8")
    const stripped = content
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
    return JSON.parse(stripped) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * Resolve the effective JEV configuration.
 * Layering: defaults < momo.jsonc `decision` < gui.json `jev` < MOMO_DECISION_* env.
 * The Bamboo API key is accepted as BAMBOO_API_KEY when no explicit
 * MOMO_DECISION_API_KEY is set.
 */
export function resolveJEVConfig(env: NodeJS.ProcessEnv = process.env): JEVRuntimeConfig {
  const cfg: JEVRuntimeConfig = { ...JEV_DEFAULTS }

  const decision = readJsonc(path.join(getConfigDir(), "momo.jsonc"))?.decision
  if (decision && typeof decision === "object") {
    const d = decision as Record<string, unknown>
    const provider = asString(d.provider)
    const model = asString(d.model)
    if (provider) cfg.provider = provider
    if (model) cfg.model = model
    if (isMode(d.mode)) cfg.mode = d.mode
    if (Array.isArray(d.points)) cfg.gates = d.points.filter(isGate)
    if (typeof d.deadlineMs === "number" && d.deadlineMs > 0) cfg.timeoutMs = d.deadlineMs
    if (isRawLogging(d.rawLogging)) cfg.rawLogging = d.rawLogging
  }

  const jev = readJson(path.join(getConfigDir(), "gui.json"))?.jev
  if (jev && typeof jev === "object") {
    const j = jev as Record<string, unknown>
    const provider = asString(j.provider)
    const model = asString(j.model)
    const baseUrl = asString(j.baseUrl)
    const apiKey = asString(j.apiKey)
    if (provider) cfg.provider = provider
    if (model) cfg.model = model
    if (baseUrl) cfg.baseUrl = baseUrl
    if (apiKey) cfg.apiKey = apiKey
    if (isMode(j.mode)) cfg.mode = j.mode
  }

  const envProvider = asString(env.MOMO_DECISION_PROVIDER)
  const envModel = asString(env.MOMO_DECISION_MODEL)
  const envBaseUrl = asString(env.MOMO_DECISION_BASE_URL)
  const envApiKey = asString(env.MOMO_DECISION_API_KEY) ?? asString(env.BAMBOO_API_KEY)
  if (envProvider) cfg.provider = envProvider
  if (envModel) cfg.model = envModel
  if (envBaseUrl) cfg.baseUrl = envBaseUrl
  if (envApiKey) cfg.apiKey = envApiKey
  if (isMode(env.MOMO_DECISION_MODE)) cfg.mode = env.MOMO_DECISION_MODE
  if (env.MOMO_DECISION_GATES) {
    const gates = env.MOMO_DECISION_GATES.split(",").map((g) => g.trim()).filter(isGate)
    cfg.gates = gates
  }

  return cfg
}

export function createBackendForProvider(cfg: JEVRuntimeConfig): JEVBackend {
  switch (cfg.provider) {
    case "bamboonode":
    case "startlux":
      return createBamboonodeBackend({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model === JEV_DEFAULTS.model ? STARTLUX_DEFAULT_MODEL : cfg.model,
        timeoutMs: cfg.timeoutMs,
      })
    case "kev":
      return createKevBackend(cfg.baseUrl ?? "")
    case "laya-mlx":
      return createLayaBackend(cfg.model)
    case "off":
      return createNoopBackend()
    default:
      return createNoopBackend()
  }
}

interface EngineCache {
  engine: JEVEngine
  config: JEVRuntimeConfig
}

let cached: EngineCache | undefined

/**
 * Lazy singleton JEVEngine built from the resolved configuration.
 * Shadow log records append to ~/.momo/jev-shadow.jsonl (unless rawLogging=none).
 */
export function getJEVEngine(): JEVEngine {
  if (!cached) {
    const config = resolveJEVConfig()
    const backend =
      config.mode === "off" ? createNoopBackend() : createBackendForProvider(config)
    cached = {
      engine: new JEVEngine({
        backend,
        mode: config.mode,
        gates: config.gates,
        shadowLog: {
          path: path.join(getConfigDir(), "jev-shadow.jsonl"),
          rawLogging: config.rawLogging,
        },
      }),
      config,
    }
  }
  return cached.engine
}

export function getJEVRuntimeConfig(): JEVRuntimeConfig {
  getJEVEngine()
  return cached!.config
}

export function resetJEVEngine(): void {
  cached = undefined
}
