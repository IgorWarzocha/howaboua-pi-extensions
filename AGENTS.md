# Extensions Development

## Status
- **hot-reload-extension-v2**: DO NOT USE. Keeping for historical reference.
- **pi-apply-patch**: DEPRECATED by pi-hash. Keeping for reference.
- **pi-enforce-read**: DEPRECATED by pi-hash. Keeping for reference.

## Active Extensions
All active extensions have been moved to their own feature branches for extraction.

## Procedures
- **CHANGELOG.md**: You MUST update `CHANGELOG.md` whenever a feature or fix is shipped to `master`.
- **Dependencies**: You MUST NOT commit `package-lock.json` files.
- **Plans-first execution**: You MUST define implementation in `pi-todos/plans` using ID-based files in `prds/`, `specs/`, and `todos/`.
- **Template model**: Plan files in `pi-todos/plans` SHOULD be treated as templates for generated `.pi/plans` documents.
- **Linked context**: Work and review flows MUST resolve linked files to absolute paths before model execution.
- **Lifecycle control**: Models MUST NOT close or abandon tasks automatically; user closes via GUI review flow.
- **Worktrees**: Worktree branches MUST use `feat/prd-<slug>` or `feat/todo-<slug>` when worktree mode is enabled.

When operating in this directory you MUST consider loading these workflows:
- `prepare-extension-packages-for-community-publish`

