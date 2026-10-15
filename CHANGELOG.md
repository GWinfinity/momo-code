# Changelog

All notable changes to momo Code are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] - 2026-10-11

Major architecture upgrade: converged Pi-based agent architecture.

### Added

- **Unified CLI entry** (`bin/momo`) — single entry point supporting three modes: interactive REPL, Pi agent, and legacy `/evolve` `/fine-tune` handlers
- **JEV decision layer** (`src/jev/`) — 5 decision points, shadow mode, and ECE calibration
- **DecisionPort contract** (`src/decision/port.ts`) — typed decision interface (choice / bool / score / abstain)
- **RSI 3-level self-evolution loop** (`src/rsi/`) — R1/R2/R3 loop with budget control and AbortController
- **momo-bench** (`src/momo-bench/`) — three-tier evaluation framework (selection / holdout / canary) plus promotion gate with 7 reverse test cases
- **EvolutionCandidate contract** (`src/evolve/candidate.ts`) — candidate + PromotionResult with CAS guard
- **Experience closure** (`src/experience/closure.ts`) — idempotent TaskExposure → TaskOutcome → Solidify loop
- **Pi extensions** (`src/pi-extensions/`) — 6 extensions: brand banner, CoT panel, decision capsules, tactical experience injection, sensitive-operation confirmation, RSI signal collection
- **Interactive REPL** (`src/repl/`) — TTY entry with keyboard bindings (⌃T / ⌃O / ⌃C), collapsed/expanded CoT rendering, decision capsules with evidence bars
- **Runtime event envelope** (`src/runtime/types.ts`) — TaskResult + 8 event envelope types
- **momo.jsonc v2 config schema** (`src/config/schema.ts`)
- **Tests** — e2e smoke suite (23 checks) and P0–P6 integration tests

### Changed

- LICENSE / NOTICE: original-work declaration; Pi (`@earendil-works/pi-coding-agent`) is consumed as a third-party Apache-2.0 dependency, not a derivative work
- Simulated `Math.random()` paths in evaluator and gate are now explicitly marked with `[SIMULATED]` warnings
- Dependencies: added `@earendil-works/pi-coding-agent@1.1.0` and `tsx`; added `smoke` / `loop` / `bench` scripts

## [1.0.0] - 2026-06-16

### Added

- **Experience Fast Loop** (`/evolve`) — Knowledge Embedding Protocol (KEP) for second-level learning
  - Tactic model with Beta(α, β) distribution tracking
  - Thompson sampling and UCB1 selection strategies
  - Signal pattern matching from session trajectories
  - Prompt injection with token budget management
  - Solidify step for verdict feedback
  - Promotion gate with A/B benchmark + ratchet check
  - Two-speed bridge: promoted tactics → fine-tune curriculum
  - Safety guardrails (command whitelist, stagnation detection, PII scrubbing)
  - Append-only ledger (JSONL) for auditability
- **Weight Slow Loop** (`/fine-tune`) — Monte Carlo Graph Search (MCGS) training pipeline
  - Signal mining from session trajectories
  - Curriculum synthesis (Gold/Hard-negative/Replay slices)
  - MCGS exploration (EXPAND/SCORE/FUSE/PRUNE)
  - LoRA fine-tuning integration
  - Ratchet gate for monotonic improvement
  - Model registry with promote/rollback
- **CLI Command System** — `momo /evolve`, `momo /fine-tune`, `momo models`, `momo help`
- **53 TypeScript modules** across provider / evolve / experience / cli layers
- **Dual-speed evolution architecture** — experience (seconds) + weights (hours)

### Changed

- Product name: kqq Code → **momo Code**
- `bin/momo`: Rewritten from CJS to ESM command router
- `package.json`: Production-ready configuration (exports, files, engines, keywords)
- README: Complete rewrite with /evolve documentation and architecture diagrams

## [0.1.0] - 2026-06-15

### Added

- Initial momo Code implementation
- 19 LLM provider integrations (Claude, GPT-4, Gemini, OpenRouter, Groq, Mistral, etc.)
- Model tiers (ultra / standard / lite)
- Claude Code interoperability (.claude/ config inheritance, MCP servers, prompts)
- SSE streaming with 8-minute chunk timeout watchdog
- Auth system with provider credential management
- Configuration system (JSONC with schema)
- Prompt routing with multi-model support
- Effect-powered architecture
