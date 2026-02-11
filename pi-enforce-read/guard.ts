import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const FORBIDDEN_BASH_READ_PATTERNS = [
  /\bcat\b/,
  /\bhead\b/,
  /\btail\b/,
  /\bless\b/,
  /\bmore\b/,
  /\bnl\b/,
  /\bsed\b.*\bp\b/
];

function shouldBlockBashRead(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return FORBIDDEN_BASH_READ_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getToolBlockReason(toolName: string): string | null {
  if (toolName === "write" || toolName === "edit") {
    return `The '${toolName}' tool is disabled. Use the 'read' tool for reading files and 'apply_patch' for editing files.`;
  }
  return null;
}

export function setupGuard(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName === "bash") {
      const command = (event.input.command as string) || "";
      if (shouldBlockBashRead(command)) {
        return {
          block: true,
          reason: "Direct file reading via bash is blocked. You MUST use the 'read' tool for all file inspection (including images). You SHOULD batch related paths into a single MULTI-READ call via the 'files' array instead of chaining single-file calls."
        };
      }
    }

    const toolBlockReason = getToolBlockReason(event.toolName);
    if (toolBlockReason) {
      return {
        block: true,
        reason: toolBlockReason
      };
    }
  });

  pi.on("session_start", () => {
    const current = new Set(pi.getActiveTools());
    current.delete("edit");
    current.delete("write");
    pi.setActiveTools([...current]);
  });
}
