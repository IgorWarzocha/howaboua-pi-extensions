# AGENTS
## Scope

This document applies to `pi-extensions-dev/pi-hash/`.

## Files

- `index.ts`: Entry point. Registers tools and event handlers.
- `src/apply/`: Logic for `apply_patch` (parsing, rendering, applying).
- `src/read/`: Logic for hashed `read` tool.
- `src/shared/`: Hashing and normalization implementation.
- `src/bash-guard.ts`: Safety guard for shell commands.

## Testing

- Run tests with `npm run e2e`.

## Agent Rule

- The agent MUST NOT run tests proactively.
- The agent MAY run tests ONLY upon explicit user request.
