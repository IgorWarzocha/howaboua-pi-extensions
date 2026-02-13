# @pi-extensions-dev Style Guide

## 1. Protocol Mandates
- **RFC 2119 Keywords**: Documentation, tool descriptions, and error messages MUST use strict RFC 2119 keywords (MUST, MUST NOT, SHALL, SHOULD, etc.).
- **No Emojis**: Emojis MUST NOT be used anywhere in the codebase or documentation.
- **Fail Fast**: Code MUST fail fast and throw descriptive errors instead of silent failures.
- **Type Safety**: The `any` type MUST NOT be used. Use strict TypeScript interfaces and types.
- **No Logging**: `console.log` or other logging MUST NOT be used unless explicitly for active testing.
- **No Comments**: Comments MUST NOT be included in the code. Code SHALL be self-documenting.

## 2. Naming Conventions
- **Single-Word Naming**: Use single-word names for variables and functions whenever possible. Multiple words MAY be used only if absolutely necessary for clarity.

## 3. Code Style
- **Immutability**: Prefer `const` over `let`.
- **Property Access**: Avoid object destructuring; use dot notation (e.g., `user.id` instead of `{ id } = user`).
- **Early Returns**: Avoid `else` blocks. Use ternaries or early returns to reduce nesting.
- **Modular Structure**: Files MUST be modular. Every extension directory MUST use `index.ts` as the entry point.
- **Formatting**: Biome is the required formatter. All code SHALL be compatible with Biome's default configuration.

## 4. Repository Structure
- Developed extensions MUST reside in their respective subdirectories within the mono-repo.
- Cross-file concerns MUST be separated into distinct files within the same module.
