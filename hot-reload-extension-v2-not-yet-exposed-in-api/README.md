# hot-reload-extension-v2

In-process hot reload test extension using `ctx.reload()` (no daemon, no terminal restart).

## What this tests

- Reload runtime directly from an extension command via `ctx.reload()`.
- After reload, automatically queue a continuation prompt so work resumes immediately.

This is the approach referenced by changelog/docs (`ctx.reload()` + `reload-runtime` example).

## Commands

- `/hot-reload-v2 [optional prompt]`
  - writes pending continuation prompt to `.pi/hot-reload-v2-pending-prompt.json`
  - calls `ctx.reload()`
  - on next `session_start`, sends the pending prompt automatically

- `/hot-reload-v2-status`
  - shows whether a pending prompt file exists and its content

## Default continuation prompt

If no argument is given, uses:

`hot-reload worked correctly - you were implementing an extension - test it and continue troubleshooting if issues arise`

Override with env var:

```bash
export PI_HOT_RELOAD_V2_RESUME_PROMPT="..."
```

## Notes

- No systemd service required.
- No external daemon required.
- This extension is separate from `hot-reload-extension` and does not overwrite it.
