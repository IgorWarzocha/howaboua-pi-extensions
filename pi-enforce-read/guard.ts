import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const FORBIDDEN_BASH_READ_PATTERNS = [
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:cat|head|tail|less|more|nl)\b/,
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?sed\b(?=.*(?:^|\s)-n(?:\s|$))(?=.*\bp(?:\s|$|'|"))/,
];

function shouldBlockBashRead(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  const chains = normalized
    .split(/&&|\|\||;/g)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const chain of chains) {
    const firstSegment = chain.split("|")[0].trim();
    const isForbidden = FORBIDDEN_BASH_READ_PATTERNS.some((pattern) => pattern.test(firstSegment));
    if (isForbidden) {
      return true;
    }
  }
  return false;
}

function getToolBlockReason(toolName: string): string | null {
  if (toolName === "write" || toolName === "edit") {
    return `The '${toolName}' tool is disabled. Use the 'read' tool for reading files and 'apply_patch' for editing files.`;
  }
  return null;
}

export function setupGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName === "read" && ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }

    if (event.toolName === "bash") {
      const command = (event.input.command as string) || "";
      if (shouldBlockBashRead(command)) {
        return {
          block: true,
          reason:
            "Direct file reading via bash is blocked. You MUST use the 'read' tool for all file inspection (including images). You SHOULD batch related paths into a single MULTI-READ call via the 'files' array instead of chaining single-file calls.",
        };
      }
    }

    const toolBlockReason = getToolBlockReason(event.toolName);
    if (toolBlockReason) {
      return {
        block: true,
        reason: toolBlockReason,
      };
    }
  });

  pi.on("session_start", (_event, ctx) => {
    const current = new Set(pi.getActiveTools());
    current.delete("edit");
    current.delete("write");
    pi.setActiveTools([...current]);

    // Keep tool output collapsed by default. Users can expand on demand via Ctrl+O.
    if (ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }
  });

  // Re-apply collapsed state when read results arrive, in case UI state was restored/overridden.
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName === "read" && ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }
  });
}
