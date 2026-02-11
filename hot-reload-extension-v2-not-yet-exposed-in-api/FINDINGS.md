# Hot Reload V2 Findings (Blocked by API Exposure)

## Status

This extension is intentionally parked and **not enabled** in `.pi/settings.json`.

Folder renamed to:

- `hot-reload-extension-v2-not-yet-exposed-in-api`

to avoid accidental use before core API support lands.

---

## Goal

Implement a tool-driven in-process reload flow:

- tool call triggers runtime reload
- resumed session auto-continues with a prompt
- no manual slash command needed

---

## What works today

### Command context (`ExtensionCommandContext`)

Using a slash command handler, `ctx.reload()` works.

Observed behavior:

- runtime reload happens
- session resumes
- continuation prompt can be queued on `session_start`

This matches changelog/docs notes around `ctx.reload()` and the `reload-runtime` example.

### Daemon/tool restart path (v1)

The v1 extension (`hot-reload-extension`) remains functional and is the active implementation.

---

## What does **not** work today

### Tool context (`ExtensionContext`)

When called from a tool, `ctx.reload()` is not exposed.

Confirmed by runtime behavior and explicit guard in v2 tool implementation:

- `hot_reload_v2` returns: reload not available in tool context

So v2 cannot be fully tool-driven without core changes.

---

## Why earlier signal looked successful

A prior success-looking message (`Runtime reloaded. Queued continuation prompt.`) came from
`session_start` consuming a pending prompt marker from a previous command-path run.

That can create a false positive for tool-path success if not interpreted carefully.

---

## Minimal core change likely needed

Any one of these would unblock v2:

1. expose `reload()` in tool context (`ExtensionContext`), or
2. add a runtime action callable from tools, e.g. `pi.reloadRuntime()` / `pi.requestReload()`.

Then v2 can be implemented as a single tool, no command bridge.

---

## Proposed PR scope (when issues/PRs reopen)

1. Core API exposure for tool-triggered runtime reload
2. docs update (`docs/extensions.md`) clarifying where reload is callable
3. example extension for tool-only reload + continuation prompt
4. small test covering tool-context reload invocation

---

## Local state decisions taken

- v2 extension kept for later reference
- renamed with explicit blocked status in folder name
- removed from active extensions in `.pi/settings.json`
- v1 remains active
