import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from "./src/constants.js";
import { detectBashWriteViolation } from "./src/bash-guard.js";
import { parsePatch } from "./src/parser.js";
import { applyHunks } from "./src/apply.js";
import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from "./src/render.js";

export default function applyPatchExtension(pi: ExtensionAPI) {
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
      const command = (event.input.command as string || "").trim();
      const violation = detectBashWriteViolation(command);
      if (violation) {
        return {
          block: true,
          reason: violation,
        };
      }
    }
  });

  pi.registerTool({
    name: "apply_patch",
    label: "apply_patch",
    description: "Apply a patch envelope containing one or more file operations (Add, Update, Move, Delete). This tool MUST be used for all file modifications and SHOULD be used to batch related changes for atomicity.",
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      const text = renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
      if (result.isError) {
        text.text = theme.fg("error", text.text);
      }
      return text;
    },
    parameters: Type.Object({
      patchText: Type.String({ description: "Patch text containing *** Begin Patch ... *** End Patch" }),
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
