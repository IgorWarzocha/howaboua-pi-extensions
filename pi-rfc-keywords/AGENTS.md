# AGENTS.md

## Repository Overview

Pi extension that enforces RFC 2119 / RFC 8174 uppercase keywords in user prompt text.

## Build & Verification

- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`

## Rules

- Do not add custom replacement configuration.
- Keep replacement list fixed to RFC keywords.
- Replacements must stay case-insensitive and word-boundary-safe.
