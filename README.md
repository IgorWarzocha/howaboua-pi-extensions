# Pi Extensions Dev

A collection of Pi extensions that add practical features like long-term memory, workflow capture, Git worktree forking, RFC keyword normalization, and agent management.

This repository is for Pi users who want to quickly add capabilities to their Pi setup, and for people testing extension ideas locally.

## Quick Start

Install and use one extension in under a minute:

```bash
cd /home/igorw/Work/pi/pi-extensions-dev
pi -e /home/igorw/Work/pi/pi-extensions-dev/pi-rfc-keywords-extension/src/index.ts
```

Then send a prompt with words like `must`, `should not`, or `may` and the extension will normalize them to RFC uppercase forms.

## What is in this repo

User-ready extensions with documentation:

- `pi-rfc-keywords-extension` - normalizes RFC 2119/8174 keywords in prompts.
- `pi-remember-extension` - local semantic memory (`remember`, `recall`, `forget`).
- `pi-workflows-tool` - workflow creation and workflow context injection.
- `pi-worktree-forker` - creates a Git worktree/branch when forking sessions.
- `pi-agent-manager` - manage subagents and skill permissions.
- `hot-reload-extension` - restart Pi into a new terminal while continuing the same session.

Other folders are experiments, internal tooling, or in-progress extensions.

## Installation

You can run extensions directly from this repository path, or install published packages when available.

### Option A: Local path (works immediately)

From any project where you run Pi:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/<extension>/src/index.ts
```

Example:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/pi-remember-extension/src/index.ts
```

### Option B: Install from npm (published extensions)

```bash
pi install npm:@pi-extensions-dev/pi-remember-extension
pi install npm:@pi-extensions-dev/pi-rfc-keywords-extension
pi install npm:@pi-extensions-dev/pi-workflows-tool
```

## Usage

## 1) RFC Keywords Extension

Path: `pi-rfc-keywords-extension`

Install:

```bash
pi install npm:@pi-extensions-dev/pi-rfc-keywords-extension
```

Use:
- Write prompts naturally (`must`, `should`, `may`, `must not`).
- The extension rewrites them as uppercase RFC keywords.
- Slash command names are preserved; only arguments are rewritten.

Example:

Input:

```text
must not use console logs; should return early
```

Output behavior:

```text
MUST NOT use console logs; SHOULD return early
```

## 2) Remember Extension

Path: `pi-remember-extension`

Install:

```bash
pi install npm:@pi-extensions-dev/pi-remember-extension
```

Use tools:
- `remember` - store memory
- `recall` - semantic lookup
- `forget` - delete by memory ID

Default storage:
- project: `./.agents/memory/memories.sqlite`
- global: `~/.pi/agent/memory/memories.sqlite`

## 3) Workflows Tool

Path: `pi-workflows-tool`

Install:

```bash
pi install npm:@pi-extensions-dev/pi-workflows-tool
```

Use:
- `/workflow` to convert session outcomes into reusable workflow docs.
- `workflows_create` tool for programmatic workflow creation.
- Generated files go to `./.agents/workflows/<slug>/SKILL.md`.

## 4) Worktree Forker

Path: `pi-worktree-forker`

Run locally:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/pi-worktree-forker/src/index.ts
```

Use:
1. Open Pi in a Git repository.
2. Run `/fork` or press `Escape` twice on an empty editor.
3. Pick **Create Git Worktree + Branch**.
4. Follow the printed command to switch into the new worktree.

## 5) Agent Manager

Path: `pi-agent-manager`

Run locally:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/pi-agent-manager/src/index.ts
```

Use:
- Run `/agents` to create, enable/disable, edit, and delete subagents.
- Subagents appear in `<available_subagents>` and can be called via `invoke_subagent`.

## 6) Hot Reload Extension

Path: `hot-reload-extension`

Run locally:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/hot-reload-extension/index.ts
```

Use:
- call `hot_reload` to restart Pi in a new terminal while resuming the same session.
- `/reload:status` for extension and daemon status.
- `/reload:log [lines]` for diagnostic logs.

## Common setup pattern

If you prefer persistent extension loading, add paths to your Pi settings file.

Example `~/.pi/settings.json` snippet:

```json
{
  "extensions": [
    "/home/igorw/Work/pi/pi-extensions-dev/pi-rfc-keywords-extension/src/index.ts",
    "/home/igorw/Work/pi/pi-extensions-dev/pi-remember-extension/src/index.ts"
  ]
}
```

## Troubleshooting

- If a command is not recognized, confirm the extension path is correct and restart Pi.
- If npm install fails, use the local `pi -e /absolute/path/...` method.
- For memory/workflow features, check that your current project allows writing `.agents/*` files.

## Notes for advanced users

This is a workspace-style repository (`package.json` with `workspaces: ["*"]`).

If you are developing extension code, run TypeScript checks/build inside the specific extension directory where scripts are defined.
