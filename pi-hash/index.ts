import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadHashTool } from "./src/read/tool.js";
import { setupReadGuard } from "./src/read/guard.js";
import { Type } from "@sinclair/typebox";
import { detectBashWriteViolation } from "./src/bash-guard.js";
import { parsePatch } from "./src/parser.js";
import { applyHunks } from "./src/apply.js";
import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from "./src/render.js";
import { enrichParseError } from "./src/parse-recovery.js";

export default function applyPatchExtension(pi: ExtensionAPI) {
  registerReadHashTool(pi);
  setupReadGuard(pi);
  let patchCallsInTurn = 0;

  pi.on("turn_start", () => {
    patchCallsInTurn = 0;
  });

  pi.on("session_start", () => {
    const current = new Set(pi.getActiveTools());
    current.add("apply_patch");
    current.delete("edit");
    current.delete("write");
    pi.setActiveTools([...current]);
  });

  pi.on("tool_call", (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: `The '${event.toolName}' tool is disabled. Use apply_patch for all file modifications.`,
      };
    }

    if (event.toolName === "bash") {
      const command = ((event.input.command as string) || "").trim();
      const violation = detectBashWriteViolation(command);
      if (violation) {
        return {
          block: true,
          reason: violation,
        };
      }
    }

    if (event.toolName === "apply_patch") {
      if (patchCallsInTurn > 0) {
        return {
          block: true,
          reason:
            "Multiple apply_patch calls in the same turn are blocked. You MUST batch all related file changes into one apply_patch envelope. You MUST NOT emit sequential apply_patch calls for the same request.",
        };
      }
      patchCallsInTurn += 1;
    }
  });

  pi.registerTool({
    name: "apply_patch",
    label: "apply_patch",
    description: `Modify files using anchored diffs. STRUCTURE: '*** Begin Patch' → file sections → '*** End Patch'. FILE SECTIONS: '*** Add File: <path>' (create), '*** Update File: <path>' (edit), '*** Delete File: <path>' (remove). To rename: add '*** Move to: <new-path>' after Update File line. UPDATE HUNKS: Start with '@@' on its own line. Body lines: ' 1:ab|x' = context (unchanged), '-1:ab|x' = remove, '+x' = add. Copy context/removal anchors EXACTLY from read output (LINE:HASH|content). Always read file first, batch all changes in one call.`,
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
        description: "Patch envelope starting with '*** Begin Patch' and ending with '*** End Patch'. Inside: file sections (*** Add/Update/Delete File: <path>). Update sections have @@ hunk markers. Body lines: ' ' or '-' prefix MUST include LINE:HASH| anchor from read tool. '+' prefix has no anchor.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const hunks = parsePatch(params.patchText);
        const summary = await applyHunks(ctx.cwd, hunks);
        const successCount = summary.added.length + summary.modified.length + summary.deleted.length;
        const allFailed = summary.failed.length > 0 && successCount === 0;
        return {
          content: [{ type: "text", text: formatSummary(summary) }],
          isError: allFailed,
          details: summary,
        };
      } catch (error) {
        const errorMessage = await enrichParseError(ctx.cwd, params.patchText, error);
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
