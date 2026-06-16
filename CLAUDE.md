# CLAUDE.md -- Agent Working Agreement

This file defines how Claude (and momo Code) should work with this codebase.

## Project Context

- **Project**: momo Code -- AI-powered coding agent
- **Language**: TypeScript
- **Framework**: Effect
- **Runtime**: Bun

## Code Patterns

- Use `Effect.gen(function* () { ... })` for effectful computations
- Use `Effect.Service` for dependency injection
- Use `Effect.catchAll` for error handling
- Prefer `readonly` and immutable data structures

## Testing

- Write tests alongside code (co-located or in `test/`)
- Use `bun test` to run tests
- Aim for >80% coverage on critical paths

## Commit Style

Follow conventional commits:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Review Checklist

Before submitting:
- [ ] TypeScript compiles without errors
- [ ] Tests pass
- [ ] No secrets or credentials in code
- [ ] Documentation updated if needed
