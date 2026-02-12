import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";

const BASH_READ_PATTERNS = [
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:cat|head|tail|less|more|nl)\b/,
  /^(?:\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?sed\b(?=.*(?:^|\s)-n(?:\s|$))(?=.*\bp(?:\s|$|'|"))/,
];

const NUDGE = "Note: read_hash provides multi-file reads, offset/limit, and in-file search with LINEHASH| anchors required by apply_hash. Prefer read_hash over bash for file inspection.";

function matchesBashRead(command: string): boolean {
  const chains = command.trim().split(/&&|\|\||;/g).map((s) => s.trim()).filter(Boolean);
  for (const chain of chains) {
    const first = chain.split("|")[0].trim();
    if (BASH_READ_PATTERNS.some((p) => p.test(first))) return true;
  }
  return false;
}

export function setupReadGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName === "read_hash" && ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }
  });

  pi.on("tool_result", (event, ctx) => {
    if (event.toolName === "read_hash" && ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }
    if (event.toolName === "bash" && !event.isError && event.input) {
      const command = (event.input.command as string) ?? "";
      if (matchesBashRead(command)) {
        const existing: (TextContent | ImageContent)[] = Array.isArray(event.content) ? event.content : [];
        return {
          content: [...existing, { type: "text" as const, text: `\n${NUDGE}` }],
        };
      }
    }
  });
}
