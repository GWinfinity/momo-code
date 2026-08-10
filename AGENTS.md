# AGENTS.md -- Project Agent Instructions

## How to Work With This Codebase

### Getting Started

1. Read the project README
2. Check `.momo/momo.jsonc` for configuration
3. Review existing code patterns before making changes

### Making Changes

1. Understand the full context first -- read related files
2. Follow the Effect framework patterns
3. Keep changes minimal and focused
4. Add/update tests for new functionality
5. Run `bun typecheck` before committing

### Quality Gates (enforced)

Git hooks live in `.githooks/` (activate with `git config core.hooksPath .githooks`):

- `pre-commit` -- `tsc --noEmit` must pass (blocks commit)
- `pre-push` -- full test suite (`npx tsx --test src/test/*.test.ts`) must be green (blocks push)
- CI (`.github/workflows/ci.yml`) -- typecheck + build + tests on every push/PR to `main`

Bypass only in emergencies: `--no-verify`. Never commit red tests to `main`.

### Key Directories

- `packages/opencode/src/` -- Core agent logic
- `packages/opencode/src/evolve/` -- Self-evolution system
- `packages/opencode/src/experience/` -- Experience fast loop (KEP tactics)
- `packages/opencode/src/refine/` -- Evidence-driven self-improvement proposals (/refine)
- `packages/opencode/src/subagent/` -- Process-level RLM subagent spawning & orchestration
- `packages/opencode/src/goal/` -- Persistent long-term goals (/goal)
- `packages/opencode/src/schedule/` -- Timed tasks, heartbeat runner (/schedule, /heartbeat, /daemon)
- `packages/opencode/src/sim/` -- Genesis world bridge + LLM control loop (/sim)
- `packages/opencode/src/optim/` -- Reasoning-driven parameter optimization (/optim)
- `packages/opencode/src/serve/` -- Local HTTP server + dashboard (momo serve)
- `packages/opencode/python/genesis_world/` -- Persistent world server (JSON-RPC) + examples
- `packages/opencode/src/voice/` + `python/voice/` -- Voice input: recording + STT (/voice)
- `packages/opencode/src/session/` -- Prompt routing + session trajectory recorder
- `packages/opencode/src/provider/` -- Model providers
- `packages/core/` -- Shared utilities and types
- `.momo/` -- User configuration, agents, commands, skills

### Environment

- `MOMO_HOME` -- momo Code home directory (default: `~/.momo`)
- `MOMO_CONFIG` -- Path to config file
- `MOMO_DISABLE_AUTOUPDATE` -- Disable auto-updates
- `MOMO_EVOLVE_ENABLED` -- Enable self-evolution
- `MOMO_SESSION_RECORD` -- Set `false` to disable session trajectory recording
- `MOMO_RLM_MAX_DEPTH` -- Subagent recursion limit (default: 3)
- `MOMO_RLM_BUDGET` -- Max subagents per orchestration (default: 8)
- `MOMO_DAEMON_INTERVAL` -- Daemon poll interval seconds (default: 60)
- `MOMO_DAEMON_MAX_RUNS` / `MOMO_DAEMON_MAX_HOURS` -- Daemon budget rails
- `MOMO_SIM_PYTHON` -- Python executable for the Genesis world server
- `MOMO_SIM_BACKEND` -- Genesis backend: cpu or gpu (default: cpu)
- `MOMO_SIM_MAX_STEPS` -- Max /sim control-loop steps (default: 20)
- `MOMO_OPTIM_HISTORY` -- Trials shown to the /optim sampler (default: 5)
- `MOMO_OPTIM_N_INIT` -- /optim random warmup trials (default: 2)
- `MOMO_OPTIM_TIMEOUT` -- /optim sampler LLM call timeout seconds (default: 300)
- `MOMO_SERVE_PORT` -- momo serve port (default: 4097)
- `MOMO_SERVE_HOST` -- momo serve bind address (default: 127.0.0.1; non-loopback requires token)
- `MOMO_SERVE_TOKEN` -- Bearer token for momo serve (unset = loopback-only, no auth)
- `MOMO_STT_API_KEY` / `MOMO_STT_BASE_URL` / `MOMO_STT_MODEL` -- Speech-to-text for /voice
- `MOMO_VOICE_SECONDS` -- Default recording length (default: 5)
