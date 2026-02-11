# hot-reload-extension

Linux daemon-based hot reload for Pi.

## What this does

- Registers the running Pi process (`pid`, `cwd`, `sessionFile`) with a local daemon.
- `hot_reload` tool asks the daemon to restart the current instance.
- Current Pi instance shuts down cleanly.
- Daemon opens a **new terminal window** and runs:
  - `pi --session <same-session-file> --provider <same-provider> --model <same-model> --thinking <same-thinking> "<resume prompt>"`
- Daemon prunes dead/stale registered instances automatically when handling requests.

This is a full process restart with session continuation (not in-process `/reload`).

## Files

- `index.ts` — Pi extension (tools + session hooks)
- `daemon.js` — user daemon + CLI client
- `systemd/pi-hot-reloadd.service` — user service unit
- `install-systemd-user.sh` — install helper

## Setup

### 1) Ensure extension path is enabled

Your `.pi/settings.json` should include:

```json
{
  "extensions": ["./.pi/extensions/hot-reload-extension/index.ts"]
}
```

### 2) Optional pre-install of daemon as user service

```bash
cd /home/igorw/Work/pi/pi-extensions-dev/hot-reload-extension
./install-systemd-user.sh
```

The extension now auto-ensures daemon availability on every `session_start`:

1. checks systemd user support
2. installs `~/.config/systemd/user/pi-hot-reloadd.service` if missing
3. runs `systemctl --user daemon-reload && systemctl --user enable --now pi-hot-reloadd.service`
4. verifies active state
5. if systemd path fails, falls back to direct `daemon.js ensure-daemon`

### 3) Reload Pi once

Restart Pi (or run `/reload` once) to pick up latest extension code.

## Usage

- Call tool: `hot_reload`
  - Expected: current Pi exits, new terminal opens with resumed session.

- Command: `/reload:status`
  - Shows extension markers + daemon status in chat.

- Command: `/reload:log [lines]`
  - Shows extension log tail.

## Logs / state

Logging is **optional** and disabled by default.
Enable diagnostics with:

```bash
export PI_HOT_RELOAD_LOG=1
```

Runtime dir (usually `/run/user/$UID`):

- `pi-hot-reloadd-<uid>.sock`
- `pi-hot-reloadd-<uid>.json`
- `pi-hot-reloadd-<uid>.log` (only when logging enabled)

Extension log:

- `/tmp/pi-hot-reload-extension.log` (only when logging enabled)

## Daemon CLI endpoints

From extension directory:

```bash
./daemon.js status   # full daemon state
./daemon.js list     # registered pi instances only
```

## Notes

- This design intentionally launches a new terminal window (as requested).
- By default the daemon uses **safe** old-terminal closing (`PI_HOT_RELOAD_CLOSE_OLD_TERMINAL=safe`).
  - `safe` (default): only closes terminals that are unlikely to be shared multi-window terminal processes.
  - `0` / `false` / `off`: never try to close the old terminal.
  - `force`: aggressive old behavior (may close multiple windows/tabs for shared terminal backends).
- Terminal selection priority:
  1. `PI_HOT_RELOAD_TERMINAL`
  2. registered `TERM_PROGRAM`
  3. fallback list (`ghostty`, `xdg-terminal-exec`, ...)

- Pi binary override:
  - `PI_HOT_RELOAD_PI_BIN=/full/path/to/pi`
- Resume prompt override:
  - `PI_HOT_RELOAD_RESUME_PROMPT="hot-reload worked correctly - you were implementing an extension - test it and continue troubleshooting if issues arise"`
