# Hot Reload V2 Findings (Blocked by API Exposure)
# Hot Reload V2 Findings (Resolved via /reload)

## Status

This extension is now functional using `pi.sendUserMessage("/reload")` from the tool context.

## Findings

- `ctx.reload()` is still not available in `ExtensionContext` (tool context).
- `pi.sendUserMessage("/reload")` successfully triggers a runtime reload.
- This allows for a purely tool-driven hot reload flow without needing an external daemon or `ctx.reload` exposure in the tool context.

## Recommendation

- Use `hot-reload-v2` as the primary hot reload mechanism.
- `hot-reload-extension` (v1 with systemd daemon) can be deprecated if v2 proves stable across environments.
