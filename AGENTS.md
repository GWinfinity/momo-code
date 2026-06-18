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

### Key Directories

- `packages/opencode/src/` -- Core agent logic
- `packages/opencode/src/evolve/` -- Self-evolution system
- `packages/opencode/src/provider/` -- Model providers
- `packages/opencode/src/session/` -- Agent session management
- `packages/core/` -- Shared utilities and types
- `.momo/` -- User configuration, agents, commands, skills

### Environment

- `MOMO_HOME` -- momo Code home directory (default: `~/.momo`)
- `MOMO_CONFIG` -- Path to config file
- `MOMO_DISABLE_AUTOUPDATE` -- Disable auto-updates
- `MOMO_EVOLVE_ENABLED` -- Enable self-evolution
