# hot-reload-extension-v2

In-process hot reload extension using `pi.sendUserMessage("/reload")` (no daemon, no terminal restart).

## What this tests

- Reload runtime directly from a tool via `pi.sendUserMessage("/reload")`.
- After reload, automatically queue a continuation prompt so work resumes immediately.

This approach bypasses the lack of `ctx.reload()` in tool context by using the slash command.

## Tools

- `hot_reload_v2 [optional prompt]`
  - writes pending continuation prompt to `.pi/hot-reload-v2-pending-prompt.json`
  - sends `/reload` to the agent
  - on next `session_start`, sends the pending prompt automatically

## Commands (Slash)

- `/hot-reload-v2 [optional prompt]`
  - legacy command-path trigger (redundant if using tool)

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
