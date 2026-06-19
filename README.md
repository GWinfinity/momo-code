
# MOMO CODE 

```txt

███╗   ███╗ ██████╗ ███╗   ███╗ ██████╗    ██████╗ ██████╗ ██████╗ ███████╗
████╗ ████║██╔═══██╗████╗ ████║██╔═══██╗  ██╔════╝██╔═══██╗██╔══██╗██╔════╝
██╔████╔██║██║   ██║██╔████╔██║██║   ██║  ██║     ██║   ██║██║  ██║█████╗  
██║╚██╔╝██║██║   ██║██║╚██╔╝██║██║   ██║  ██║     ██║   ██║██║  ██║██╔══╝  
██║ ╚═╝ ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝  ╚██████╗╚██████╔╝██████╔╝███████╗
╚═╝     ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝    ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

# MOMO CODE 🔥v1.0.0

<div align="center">

<br>

<p>
<a href="##Website##" target="_blank">
  <img src="https://momozi.cc/" width="24" alt="官方网站">
</a>
 
<a href="##Huggingface##" target="_blank">
  <img src="https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/huggingface.svg" width="24" alt="Hugging Face">
</a>
 
<a href="./README.md">
  <img src="https://github.com/momozi1996/momo-code/blob/main/README_zh.md" width="24" alt="切换中文">
</a>
</p>
</div>

<br>


> **AI-powered coding agent that evolves with you.**  
> Built on [opencode](https://github.com/sst/opencode) with a unique dual-speed self-evolution system based on [Pioneer Agent](https://arxiv.org/abs/2604.09791).


## Architecture
| Two-Speed Evolution Algorithm |System Technical Architecture |
|------|----------|
|<img width="1672" height="941" alt="AG" src="https://github.com/user-attachments/assets/bb127413-b647-4c7e-bd5d-696f348f8f31" />|<img width="1672" height="941" alt="SS" src="https://github.com/user-attachments/assets/176ccbff-1a24-4a81-9b77-c6e22e757760" />|

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Experience Fast Loop (`/evolve`)](#experience-fast-loop-evolve)
- [Self-Evolution Training (`/fine-tune`)](#self-evolution-training-fine-tune)
- [Migrating from Claude Code](#migrating-from-claude-code)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Changelog](#changelog)
- [License](#license)

## Features

- **25+ LLM Providers** — Deepseek, Zhipu (GLM), Moonshot (Kimi), Claude, GPT-4, Gemini, Doubao, OpenRouter, Groq, Mistral, and more
- **Custom Provider** — Plug in any OpenAI-compatible API with `MOMO_CUSTOM_*` env vars
- **Model Tiers** — Zero-config selection: `ultra` / `standard` / `lite`
- **Experience Fast Loop (`/evolve`)** — Second-level prompt injection via KEP protocol. Tactics distilled from success are auto-selected via Thompson sampling
- **Self-Evolution Training (`/fine-tune`)** — Hour-level weight improvement via Monte Carlo Graph Search (MCGS) + LoRA
- **Claude Code Interop** — Seamless migration, inherits `.claude/` config, MCP servers, prompts
- **Local-first** — Your code never leaves your machine. Open source, auditable
- **Effect-powered** — Built with Effect for composable, type-safe code

## Installation

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0

### From npm （暂不支持，先使用git clone或者curl）

```bash
npm install -g @momo/cli
```

### From source

```bash
git clone https://github.com/momozi1996/momo-code.git
cd momo-code/packages/opencode
npm install
npm run build
```

### Quick install (macOS/Linux)

```bash
curl -fsSL https://momocode.cc/install | bash
```

## Quick Start

### 1. Set up API key

```bash
# Generic key (works with any provider)
export MOMO_API_KEY=your-api-key

# Or provider-specific
export MOMO_ANTHROPIC_API_KEY=sk-ant-...
export MOMO_OPENAI_API_KEY=sk-...
```

### 2. Start coding

```bash
# Interactive mode
momo

# One-shot task
momo "Refactor auth to use Effect"

# Use a model tier
momo --model ultra "Complex architecture review"
momo --model standard "Fix the login bug"
momo --model lite "Quick code review"
```

### 3. First run

On first run, momo creates `~/.momo/`:

```
~/.momo/
├── momo.jsonc          # Config
├── sessions/           # History
├── experience/         # Learned tactics (auto-created)
│   ├── tactics.jsonl
│   └── ledger.jsonl
└── ...
```

## Usage

### Model Tiers

| Tier | Use Case |
|------|----------|
| `ultra` | Complex tasks, large context |
| `standard` | Daily coding work |
| `lite` | Quick tasks, low latency |

### CLI Options

```bash
momo [options] [prompt]

Options:
  --model, -m <id>       Model ID or tier
  --provider, -p <name>  Provider
  --help                 Show help
  --version              Show version
```

## CLI Commands

### Coding Session

```bash
momo                     # Interactive mode
momo "prompt"            # One-shot task
momo --model claude-sonnet-4 "task"
```

### Experience Fast Loop (`/evolve`)

```bash
momo /evolve                       # Run evolution with default settings
momo /evolve --mode=explore        # Favor exploration of new tactics
momo /evolve --mode=harden         # Favor proven high-win-rate tactics
momo /evolve --mode=convention-only # Only convention-type tactics
momo /evolve --list                # Show all learned tactics
momo /evolve --inject              # Inject tactics for current task
momo /evolve --solidify            # Apply verdict, update stats
```

### Self-Evolution Training (`/fine-tune`)

```bash
momo /fine-tune              # Diagnose, show training proposal
momo /fine-tune run          # Execute training pipeline
momo /fine-tune run --dry-run # Preview without executing
momo /fine-tune status       # Check training status
momo /fine-tune promote      # Promote candidate to production
```

### Models

```bash
momo models list         # List all models
momo models info <id>    # Show model details
momo models providers    # Show available providers
```

## Configuration

### Config File (`~/.momo/momo.jsonc`)

```jsonc
{
  "$schema": "https://momocode.cc/config.json",
  "model": "standard",
  "provider": "anthropic",
  "inheritClaudeCode": true,
  "evolve": {
    "enabled": true,
    "auto": false,
    "clusterThreshold": 10,
    "budgetUSD": 50
  }
}
```

## Experience Fast Loop (`/evolve`)

The experience fast loop (KEP — Knowledge Embedding Protocol) is momo's unique **second-level** learning system. Unlike `/fine-tune` which updates model weights over hours, `/evolve` learns and applies knowledge in **seconds** via prompt injection.

### How it works

1. **Observe** — Extract signals from sessions (test pass/fail, edit accepted/rejected, user corrections)
2. **Distill** — Convert successful patterns into compact Tactic cards
3. **Select** — Rank tactics via **Thompson sampling** (Bayesian explore/exploit)
4. **Inject** — Insert top-k tactics into the system prompt for the current task
5. **Solidify** — Apply verdict, update Beta distribution statistics
6. **Promote** — High-confidence tactics graduate to `/fine-tune` curriculum

### Three KEP Assets

| Asset | Description |
|-------|-------------|
| **Tactic** | Compact strategy card with triggers, steps, checks, guardrails |
| **Case** | Successful task record with injected tactics |
| **Ledger** | Append-only audit log (JSONL) |

### Tactic Statistics (Beta Distribution)

Each tactic tracks a Beta(α, β) distribution:
- α = 1 + wins, β = 1 + losses
- **Thompson sampling** for exploration/exploitation balance
- **UCB1** as alternative selection strategy

### Evolution Modes

| Mode | Behavior |
|------|----------|
| `balanced` (default) | Normal explore/exploit trade-off |
| `explore` | Favor new tactics, wider sampling |
| `harden` | Favor proven tactics, tighter selection |
| `convention-only` | Only convention-type tactics |

### Storage

Learned tactics are stored in `~/.momo/experience/`:
- `tactics.jsonl` — All tactic records
- `ledger.jsonl` — Audit log of all operations

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MOMO_XP_MODE` | Evolution mode | `balanced` |
| `MOMO_XP_DIR` | Storage directory | `~/.momo/experience` |

## Self-Evolution Training (`/fine-tune`)

The weight slow loop improves momo's **model weights** via fine-tuning. This runs at hour-level timescales.

### How it works

1. **Signal Mining** — Extract learning signals from sessions
2. **Curriculum Synthesis** — Build training data (Gold/Hard-neg/Replay slices)
3. **Monte Carlo Graph Search (MCGS)** — Explore training pipeline space
4. **LoRA Fine-tuning** — Train candidate model
5. **Ratchet Gate** — Ensure monotonic improvement

### Commands

```bash
momo /fine-tune              # Diagnose, show proposal
momo /fine-tune run          # Execute training
momo /fine-tune run --dry-run # Preview
momo /fine-tune status       # Check status
momo /fine-tune promote      # Promote candidate
```

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MOMO_EVOLVE_ENABLED` | Enable self-evolution | `true` |
| `MOMO_EVOLVE_AUTO` | Auto-trigger training | `false` |
| `MOMO_EVOLVE_BUDGET_USD` | Max training budget | `50` |

## Migrating from Claude Code

Zero-friction migration:

1. **Config inheritance** (default ON) — `~/.claude/settings.json` auto-merged
2. **MCP servers** (default ON) — `.claude/mcp/` work out of the box
3. **Prompts** (default ON) — `.claude/prompts/` available

```bash
# Disable inheritance
export MOMO_CLAUDE_CODE_INHERIT=false
export MOMO_ONLY=1
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MOMO_API_KEY` | Generic API key |
| `MOMO_HOME` | Home directory (default: `~/.momo`) |
| `MOMO_MODEL` | Default model/tier |
| `MOMO_PROVIDER` | Default provider |
| `MOMO_XP_MODE` | Evolution mode (balanced/explore/harden/convention-only) |
| `MOMO_XP_DIR` | Experience storage dir |
| `MOMO_EVOLVE_ENABLED` | Enable self-evolution |
| `MOMO_EVOLVE_BUDGET_USD` | Training budget |
| `MOMO_ANTHROPIC_API_KEY` | Anthropic key |
| `MOMO_OPENAI_API_KEY` | OpenAI key |
| `MOMO_OPENROUTER_API_KEY` | OpenRouter key |

Full list: `src/env.ts`

## Architecture

### Dual-Speed Evolution

```
┌─────────────────────────────────────────────────────────┐
│                    momo Code                             │
├─────────────────────┬───────────────────────────────────┤
│  Experience Fast    │  Weight Slow Loop                 │
│  Loop (/evolve)     │  (/fine-tune)                     │
├─────────────────────┼───────────────────────────────────┤
│  Timescale: seconds │  Timescale: hours                 │
│  Mechanism: prompt  │  Mechanism: LoRA fine-tuning      │
│   injection         │                                   │
│  Selection:         │  Search: Monte Carlo Graph        │
│   Thompson/UCB      │   Search (MCGS)                   │
│  Storage: JSONL     │  Training: LoRA                   │
│   (~/.momo/xp/)     │  Gate: Ratchet check              │
│  Bridge: promoted   │  Storage: model registry          │
│   → curriculum      │                                   │
└─────────────────────┴───────────────────────────────────┘
```

### Provider Layer

```
User Request
    |
    v
resolveModel("standard") → BUILTIN_TIERS.standard
    |                           [claude-sonnet, gpt-4.1, ...]
    v
getCredentials() → MOMO_*_API_KEY env
    |
    v
Provider Factory → baseUrl, headers, timeout
    |
    v
createModel() → LanguageModel adapter
    |
    v
wrapSSE() → Streaming with 8min timeout
```

### Project Structure

```
packages/opencode/src/
├── provider/       # 19 LLM provider integrations
├── evolve/         # Weight slow loop (/fine-tune) — MCGS
├── experience/     # Fast loop (/evolve) — KEP protocol
│   ├── tactic.ts       # Tactic model + Beta stats
│   ├── selector.ts     # Thompson/UCB selection
│   ├── injector.ts     # Prompt injection
│   ├── gate.ts         # Promotion ratchet
│   ├── bridge.ts       # Two-speed bridge
│   └── ...
├── cli/cmd/        # CLI commands
├── session/        # Prompt routing
├── config/         # Configuration
└── effect/         # Effect utilities
```

## Test Results

- **TypeScript**: `tsc --noEmit` — **0 errors**
- **Runtime**: 17/17 tests passed
- **CLI verified**: `/evolve`, `/fine-tune`, `models`, `help`

## Changelog

### v1.0.0 (2026-06-16)

**Added:**
- Experience fast loop (`/evolve`) — KEP protocol with Thompson sampling
- Weight slow loop (`/fine-tune`) — MCGS training pipeline
- CLI command system — `/evolve`, `/fine-tune`, `models`, `help`
- 53 TypeScript modules across provider/evolve/experience/cli layers
- Dual-speed evolution architecture
- Beta distribution tracking for tactic selection
- Two-speed bridge (promoted tactics → fine-tune curriculum)

**Changed:**
- Product name: kqq Code → momo Code
- bin/momo: CJS → ESM command router
- package.json: Production-ready exports, files whitelist

## License

[MIT](LICENSE) — see [NOTICE](NOTICE) for third-party attributions.
See [USE_RESTRICTIONS.md](USE_RESTRICTIONS.md) and [SECURITY.md](SECURITY.md).
