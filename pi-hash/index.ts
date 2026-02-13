import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadHashTool } from "./src/read/tool.js";
import { setupReadGuard } from "./src/read/guard.js";
import { Type } from "@sinclair/typebox";
import { detectBashWriteViolation } from "./src/bash-guard.js";
import { parsePatch } from "./src/apply/parser.js";
import { applyHunks } from "./src/apply/index.js";
import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from "./src/apply/render.js";
import { enrichParseError } from "./src/apply/parse-recovery.js";

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
     description: `Edit files with anchored diffs. Returns updated LINE:HASH anchors on success — you MUST use these for subsequent edits, NEVER re-read. STRUCTURE: '*** Begin Patch' → file sections → '*** End Patch'. SECTIONS: '*** Create File: <path>', '*** Edit File: <path>', '*** Delete File: <path>', '*** Move File: <path>' + '*** Move to: <new-path>'. HUNKS: Optional '@@ <text>' positioning hint, then body: ' ' or '-' lines MUST have LINE:HASH| anchor, '+' lines have no anchor. You MUST batch ALL changes into ONE call.`,
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
description: "Patch envelope starting with '*** Begin Patch' and ending with '*** End Patch'. Inside: file sections (*** Create/Edit/Delete/Move File: <path>). Edit sections have @@ hunk markers. Body lines: ' ' or '-' prefix MUST include LINE:HASH| anchor from read tool. '+' prefix has no anchor.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const hunks = parsePatch(params.patchText);
        const summary = await applyHunks(ctx.cwd, hunks);
        const successCount = summary.created.length + summary.edited.length + summary.moved.length + summary.deleted.length;
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
