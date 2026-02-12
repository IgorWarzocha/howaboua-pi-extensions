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
    current.add("apply_hash");
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
        reason: `The '${event.toolName}' tool is disabled. Use apply_hash for all file modifications.`,
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

    if (event.toolName === "apply_hash") {
      if (patchCallsInTurn > 0) {
        return {
          block: true,
          reason:
            "Multiple apply_hash calls in the same turn are blocked. You MUST batch all related file changes into one apply_hash envelope. You MUST NOT emit sequential apply_hash calls for the same request.",
        };
      }
      patchCallsInTurn += 1;
    }
  });

  pi.registerTool({
    name: "apply_hash",
    label: "apply_hash",
    description:
      "Apply a patch envelope containing one or more file operations (Add, Update, Move, Delete). This tool MUST be used for all file modifications. You MUST include all related changes for a request in one call unless payload limits require splitting.",
    renderCall(args, theme) {
      return renderApplyPatchCall(args, parsePatch, theme);
    },
    renderResult(result, options, theme) {
      return renderApplyPatchResult(result, options.expanded, options.isPartial, theme);
    },
    parameters: Type.Object({
      patchText: Type.String({
        description: "Patch text containing *** Begin Patch ... *** End Patch. It MUST include all related file operations for the current request in a single atomic envelope when feasible.",
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
