import type { ExtensionContext, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { STATE_ENTRY, type RalphState } from "./types.js";

export function loadState(ctx: ExtensionContext): RalphState | null {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as any;
    if (entry.type === "custom" && entry.customType === STATE_ENTRY && entry.data) {
      return entry.data as RalphState;
    }
  }
  return null;
}

export function persistState(pi: ExtensionAPI, state: RalphState): void {
  pi.appendEntry(STATE_ENTRY, state);
}
