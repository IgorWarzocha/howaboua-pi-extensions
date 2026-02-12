# AGENTS

## Scope

This document applies to `pi-extensions-dev/pi-apply-patch/`.

## Files

- `index.ts`: Registers the extension, enables `apply_patch`, injects prompt instructions, blocks `edit`/`write`, and guards bash write attempts.
- `src/constants.ts`: Patch markers and system prompt instruction text.
- `src/types.ts`: Core patch/apply types and parser error classes.
- `src/path-utils.ts`: Relative-path validation and cwd path resolution.
- `src/parser.ts`: Patch envelope/hunk parser and validation logic.
- `src/apply.ts`: Applies parsed hunks to disk and builds apply summary/diff metadata.
- `src/render.ts`: Tool call/result rendering and summary formatting.
- `src/bash-guard.ts`: Detects write-like shell commands and returns blocking reasons.
- `e2e-runner.sh`: End-to-end checks for add/update/move/delete, parser errors, and bash guard behavior.
- `package.json`: Project metadata and `npm run e2e` script.

## Testing

- Test command: `npm run e2e`
- Model selection: defaults to `zai/glm-4.7`; override with `PI_E2E_MODEL=<model>`.

## Agent Rule

- The agent MUST NOT run tests proactively/agentically.
- The agent MAY run tests ONLY when the user explicitly requests testing.
