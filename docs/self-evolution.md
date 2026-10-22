# Self-Evolution System (`/fine-tune`)

momo Code's self-evolution system allows the agent to improve itself based on user feedback. This document describes the architecture, configuration, and security considerations.

## Architecture Overview

```
User Interaction --> Rating --> Training Data --> Fine-tuning --> Review --> Promotion
```

### Components

1. **Rating Collector** -- Captures user feedback (`--good`/`--bad`) on agent responses
2. **Training Dataset** -- Stores rated conversations in `~/.momo/evolve/`
3. **Fine-tuning Pipeline** -- Processes training data and fine-tunes the model
4. **Ratchet Gate** -- Ensures the new model performs better than the current one
5. **Promotion Gate** -- Requires human approval before deploying the new model

## Command Reference

### `/refine`

Evidence-driven self-improvement at the prompt/tactic level (fast, no
training). Reviews recent session trajectories and proposes small,
reversible changes. Human approval is mandatory.

```
/refine                  -- Generate proposals from recent sessions
/refine list             -- List proposals (pending/approved/applied/rejected)
/refine show <id>        -- Inspect a proposal's evidence and content
/refine approve <id>     -- Approve a proposal (review gate)
/refine apply <id>       -- Apply: tactic → draft tactic; patch → prompt file
/refine reject <id>      -- Reject a proposal
```

Proposals are stored in `~/.momo/refine/proposals/`. Applied tactics
enter the experience loop as `draft` and must still earn promotion
through the standard Gate. Applied prompt patches live in
`~/.momo/prompts/refine-patch.md` and are injected into every session.

### `/fine-tune`

Manage the self-evolution system.

```
/fine-tune status          -- Show current evolution status
/fine-tune history         -- View training history
/fine-tune promote         -- Manually trigger promotion review
/fine-tune reset           -- Clear training data (with confirmation)
```

### Rating Responses

After each agent response, you can rate it:

```
--good     -- Mark response as helpful (adds to training data)
--bad      -- Mark response as unhelpful
--skip     -- No rating
```

### Thresholds

| Setting | Default | Description |
|---------|---------|-------------|
| `min_good_ratings` | 50 | Minimum positive ratings before suggesting fine-tuning |
| `min_rating_ratio` | 0.7 | Minimum good/total ratio to proceed |
| `auto_suggest` | true | Automatically suggest fine-tuning when thresholds are met |

## ASPIRE Core (`/aspire`)

Port of the transportable core of NVIDIA's ASPIRE (agentic skill discovery,
NVlabs) — the generic kernel of its self-improvement loop, without the
robotics/simulation parts. The skill library is the only trusted cross-task
channel: entries are Trigger → Code → Evidence markdown, versioned by a
content hash, and nothing enters the library without passing a
transmission test — a fresh agent, given only the skill text, must re-solve
the task that motivated it.

Everything lives in `packages/opencode/src/skill/` and is driven by the
`/aspire` command:

```
/aspire init                 -- create the skill library skeleton (~/.momo/skills/)
/aspire lint [--proposal f]  -- executable lint (parse/undefined-helper/§-refs/…)
/aspire verify <p> <task>    -- transmission test for one staged proposal
/aspire apply <report.json>  -- the ONLY library writer (verified reports only) [--tactic]
/aspire grade <report.json>  -- record consulted-entry grades in skills/ledger.jsonl
/aspire campaign init|run|status  -- worker campaigns (dev + heldout bands)
/aspire evosearch init|run|status -- evolutionary search over strategy candidates
```

Where it sits in the evolution stack: `/refine` proposes small improvements
from session trajectories → `/aspire verify` gates skill text through the
transmission test → the skill library at `~/.momo/skills/` accumulates
verified entries → `/aspire apply --tactic` can promote an entry to a draft
KEP tactic, which the experience loop injects into future prompts. Campaigns
(`skill/coordinator.ts`) run fleets of workers on task sets — workers stage
`skill_report.json` proposals, the lint + verification gate decides, and
the coordinator alone writes the library. Evosearch (`skill/evosearch.ts`)
evolves K hypothesis-diverse strategy candidates per task (top-3 seeding,
eliminated ledger, diversity rule, solved/max-iterations/plateau stops).

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MOMO_ASPIRE_CONCURRENCY` | 2 | Parallel workers / candidate evaluations |
| `MOMO_ASPIRE_TASK_TIMEOUT_MS` | 900000 | Per-worker timeout |
| `MOMO_ASPIRE_VERIFY_TIMEOUT_MS` | 600000 | Per-verifier timeout |
| `MOMO_ASPIRE_EVO_K` | 6 | Evosearch population size |
| `MOMO_ASPIRE_EVO_MAX_ITER` | 5 | Evosearch iteration cap |
| `MOMO_ASPIRE_EVO_THRESHOLD` | 0.8 | Evosearch solve threshold (best passRate) |

## Configuration

Add to `~/.momo/momo.jsonc`:

```jsonc
{
  "evolve": {
    "enabled": true,
    "min_good_ratings": 50,
    "min_rating_ratio": 0.7,
    "auto_suggest": true,
    "model": {
      "provider": "openai",
      "base_model": "gpt-4o-mini",
      "epochs": 3,
      "learning_rate": 1e-5
    }
  }
}
```

## Security & Privacy

### Data Handling

- **Local by default**: All training data stays on your machine
- **Secret scrubbing**: API keys and credentials are automatically removed from training data
- **Opt-in only**: Self-evolution is disabled by default; enable with `MOMO_EVOLVE_ENABLED=1`

### Safety Mechanisms

1. **Ratchet Gate**: New models must score >= current model on a validation set
2. **Human Approval**: Fine-tuned models must be manually promoted to production
3. **Rollback**: Previous model is preserved and can be restored instantly
4. **Audit Log**: All training data sources and promotion decisions are logged

### Model Provider

The default fine-tuning uses OpenAI's API. You can configure alternative providers:

```jsonc
{
  "evolve": {
    "model": {
      "provider": "openai",      // or "anthropic", "google", etc.
      "api_key": "${OPENAI_API_KEY}",  // Uses env var substitution
      "base_model": "gpt-4o-mini"
    }
  }
}
```

## Cost Estimation

Fine-tuning costs depend on the model and training data size:

| Model | Est. Cost per Run | Typical Training Time |
|-------|------------------|----------------------|
| GPT-4o-mini | $2-5 | 10-30 minutes |
| GPT-4o | $10-25 | 20-60 minutes |

Costs are paid directly to the model provider. momo Code does not charge for fine-tuning.

## Troubleshooting

### Fine-tuning fails

1. Check API key and billing status
2. Verify minimum training data requirements
3. Review logs in `~/.momo/evolve/logs/`

### Model performs worse

1. The ratchet gate should prevent this
2. If promoted accidentally, use `/fine-tune rollback` to restore
3. Provide more `--bad` ratings on problematic responses

### Training data too small

1. Use momo Code more to generate interactions
2. Import existing conversations (see `/fine-tune import`)
3. Lower `min_good_ratings` threshold temporarily
