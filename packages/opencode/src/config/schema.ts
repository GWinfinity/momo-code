// SPDX-License-Identifier: MIT
// momo Config — Schema v2 (JSONC)
// Priority: CLI > env > project config > user config > CC Switch import > built-in default

export interface MomoConfigV2 {
  schemaVersion: 2
  runtime: {
    engine: "pi" | "legacy"
    packageVersion: string
  }
  decision: {
    provider: string
    model: string
    mode: "shadow" | "enforce" | "off"
    points: string[]
    deadlineMs: number
    fallback: "rules" | "abstain"
    questionSetVersion: string
    rawLogging: "full" | "redacted" | "none"
  }
  experience: {
    enabled: boolean
    scope: "repo" | "global" | "language"
    maxInjectedTactics: number
    maxPromptTokens: number
  }
  rsi: {
    mode: "observe" | "auto" | "off"
    allowedKinds: ("policy" | "decision-checkpoint" | "generator-checkpoint")[]
    maxCandidatesPerCampaign: number
    maxConcurrentExperiments: number
    maxAutomaticPromotionsPerScopePerDay: number
    maxTaskContinuations: number
    maxCampaignCostUsd: number
    stopFile: string
    requireProtectedVerifier: boolean
  }
  training: {
    decision: { enabled: boolean; driver: string }
    generator: { enabled: boolean; driver: string }
  }
  ui: {
    thinking: "collapsed" | "expanded" | "off"
    decisionDetails: "important-only" | "full" | "none"
    evidenceSummary: boolean
  }
}

export const DEFAULT_CONFIG_V2: MomoConfigV2 = {
  schemaVersion: 2,
  runtime: {
    engine: "pi",
    packageVersion: "1.1.0",
  },
  decision: {
    provider: "typesafe",
    model: "jev-1.13.0",
    mode: "shadow",
    points: ["tactic-relevance"],
    deadlineMs: 1500,
    fallback: "rules",
    questionSetVersion: "v1",
    rawLogging: "redacted",
  },
  experience: {
    enabled: true,
    scope: "repo",
    maxInjectedTactics: 3,
    maxPromptTokens: 1200,
  },
  rsi: {
    mode: "observe",
    allowedKinds: ["policy"],
    maxCandidatesPerCampaign: 3,
    maxConcurrentExperiments: 1,
    maxAutomaticPromotionsPerScopePerDay: 1,
    maxTaskContinuations: 1,
    maxCampaignCostUsd: 5,
    stopFile: "${MOMO_HOME}/STOP",
    requireProtectedVerifier: true,
  },
  training: {
    decision: { enabled: false, driver: "unconfigured" },
    generator: { enabled: false, driver: "unconfigured" },
  },
  ui: {
    thinking: "collapsed",
    decisionDetails: "important-only",
    evidenceSummary: true,
  },
}

// ── Resolver ──────────────────────────────────────────────────────

export interface ConfigSource {
  value: unknown
  source: "cli" | "env" | "project" | "user" | "cc-switch" | "default"
  key: string
}

export class ConfigResolver {
  private layers: Map<string, ConfigSource> = new Map()

  set(key: string, value: unknown, source: ConfigSource["source"]): void {
    // Higher priority overrides lower (CLI highest)
    const priority = { cli: 5, env: 4, project: 3, user: 2, "cc-switch": 1, default: 0 }
    const existing = this.layers.get(key)
    if (!existing || priority[source] >= priority[existing.source]) {
      this.layers.set(key, { value, source, key })
    }
  }

  get<T>(key: string): T | undefined {
    const src = this.layers.get(key)
    return src?.value as T
  }

  explain(key: string): ConfigSource | undefined {
    return this.layers.get(key)
  }

  dump(): Record<string, ConfigSource> {
    return Object.fromEntries(this.layers)
  }
}
