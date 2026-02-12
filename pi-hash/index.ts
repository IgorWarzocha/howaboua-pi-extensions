import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadHashTool } from "./src/read/tool.js";
import { setupReadGuard } from "./src/read/guard.js";
import { Type } from "@sinclair/typebox";
import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from "./src/constants.js";
import { detectBashWriteViolation } from "./src/bash-guard.js";
import { parsePatch } from "./src/parser.js";
import { applyHunks } from "./src/apply.js";
import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from "./src/render.js";

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

  pi.on("before_agent_start", (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${APPLY_PATCH_PROMPT_INSTRUCTIONS}`,
    };
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
    description:
      "Apply a patch envelope for multi-file operations (Add, Update, Move, Delete). You MUST use this tool for ALL file modifications. Update hunk context (' ') and removal ('-') lines MUST include LINEHASH|CONTENT anchors. Addition lines ('+') MUST NOT include anchors. You MUST batch all related file changes in ONE call unless payload limits require splitting by independent files.",
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
        description: "Patch text containing *** Begin Patch ... *** End Patch. The envelope MAY include Add/Update/Move/Delete across multiple files. Update hunks MUST anchor context/removal lines as LINEHASH|CONTENT.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const hunks = parsePatch(params.patchText);
        const summary = await applyHunks(ctx.cwd, hunks);
        return {
          content: [{ type: "text", text: formatSummary(summary) }],
          details: summary,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
