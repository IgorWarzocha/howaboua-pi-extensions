# @pi-extensions-dev/pi-remember-extension

Pi extension for semantic long-term memory using local embeddings.

## Features

- `remember` tool: store memory items
- `recall` tool: semantic search across memory
- `forget` tool: delete memory by ID
- Auto-injects `<user_memories>` on each user turn via `before_agent_start`

## Storage

- Project DB: `./.agents/memory/memories.sqlite`
- Global DB: `~/.pi/agent/memory/memories.sqlite`
- Embedding model cache (global): `~/.pi/agent/memory/models`

## Config

Optional JSON config:

- Global: `~/.pi/agent/remember.json`
- Project: `./.agents/remember.json` (overrides global)

```json
{
  "enabled": true,
  "scope": "project",
  "inject": {
    "count": 5,
    "highThreshold": 0.6
  }
}
```

`scope`: `"global" | "project" | "both"`

## Install

```bash
pi install npm:@pi-extensions-dev/pi-remember-extension
```

Local dev:

```bash
pi -e /absolute/path/to/pi-remember-extension/src/index.ts
```
