/**
 * `momo setup --integration <name>` — one-command onboarding.
 *
 * Focus on hermetic behavior: registry shape, unknown-name errors, the
 * voice env checks (pure env reads) and config patch merging. The sim
 * integration's python/genesis probes spawn real interpreters and are
 * only smoke-checked for structure here.
 *
 * @module test/setup-integrations
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  SETUP_INTEGRATIONS,
  applyConfigPatch,
  listSetupIntegrations,
  runIntegrationSetup,
} from "../config/integrations.js"

describe("setup integrations registry", () => {
  it("has unique names with label, description and checks", () => {
    const integrations = listSetupIntegrations()
    assert.ok(integrations.length >= 2, "at least sim and voice")
    const names = integrations.map((i) => i.name)
    assert.equal(new Set(names).size, names.length, "names unique")
    for (const integration of integrations) {
      assert.ok(integration.label, `${integration.name} has a label`)
      assert.ok(integration.description, `${integration.name} has a description`)
      assert.ok(integration.checks.length > 0, `${integration.name} has checks`)
      assert.ok(SETUP_INTEGRATIONS[integration.name], "registry keyed by name")
    }
  })

  it("unknown names fail with the available list", async () => {
    await assert.rejects(
      () => runIntegrationSetup("robodojo"),
      /unknown integration "robodojo" \(available: sim, voice\)/,
    )
  })
})

describe("voice integration (hermetic env checks)", () => {
  const vars = ["MOMO_STT_API_KEY", "MOMO_STT_BASE_URL", "MOMO_STT_MODEL"]
  const saved: Record<string, string | undefined> = {}

  function setEnv(value: string | undefined): void {
    for (const v of vars) {
      if (value === undefined) delete process.env[v]
      else process.env[v] = value
    }
  }
  function restore(): void {
    for (const v of vars) {
      if (saved[v] === undefined) delete process.env[v]
      else process.env[v] = saved[v]
    }
  }

  it("all checks pass when the STT env vars are set", async () => {
    for (const v of vars) saved[v] = process.env[v]
    setEnv("x")
    try {
      const result = await runIntegrationSetup("voice")
      assert.equal(result.ok, true)
      assert.equal(result.results.length, 3)
      assert.ok(result.results.every((r) => r.ok))
      assert.equal(result.configWritten, undefined, "voice writes no config")
    } finally {
      restore()
    }
  })

  it("missing env vars fail with fix hints", async () => {
    for (const v of vars) saved[v] = process.env[v]
    setEnv(undefined)
    try {
      const result = await runIntegrationSetup("voice")
      assert.equal(result.ok, false)
      assert.ok(result.results.every((r) => !r.ok))
      assert.ok(result.results.every((r) => (r.fix ?? "").includes("MOMO_STT_")))
    } finally {
      restore()
    }
  })
})

describe("sim integration structure", () => {
  it("has interpreter, genesis import and world server checks", async () => {
    const result = await runIntegrationSetup("sim")
    // check names regardless of whether python/genesis exist on the machine
    assert.deepEqual(
      result.results.map((r) => r.name).sort(),
      ["genesis import", "interpreter", "world server"].sort(),
    )
    // the bundled world-server check must pass in a checkout (file exists)
    const server = result.results.find((r) => r.name === "world server")!
    assert.equal(server.ok, true, `world server: ${server.detail}`)
  })
})

describe("config patch merging", () => {
  it("returns null for integrations without a patch", () => {
    assert.equal(applyConfigPatch(SETUP_INTEGRATIONS.voice, {}), null)
  })

  it("merges a patch without clobbering unrelated keys", () => {
    const fake = {
      name: "fake",
      label: "fake",
      description: "fake",
      checks: [],
      configPatch: (current: Record<string, unknown>) => ({
        experimental: { ...(current.experimental as object), simIntegration: "genesis" },
      }),
    }
    const merged = applyConfigPatch(fake, { provider: "momo", experimental: { a: 1 } })
    assert.deepEqual(merged, {
      provider: "momo",
      experimental: { a: 1, simIntegration: "genesis" },
    })
  })
})
