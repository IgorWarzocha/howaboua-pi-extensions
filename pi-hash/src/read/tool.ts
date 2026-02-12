import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { normalizeInput } from "./normalizer.js";
import { executeReadHash } from "./executor.js";
import { renderReadHash } from "./renderer.js";
import { HashFileSchema } from "./types.js";

export function registerReadHashTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read",
    label: "Read File(s)",
    description:
      "Read files with LINEHASH| anchors REQUIRED for robust editing. Supports multi-read, range slicing, and in-file search. This tool REPLACES in-file grep/rg for known paths. You MUST use this tool for inspection, and you SHOULD refresh anchors before apply_patch updates when file state MAY have changed. Lines are prefixed with LINEHASH| for apply_patch anchored hunks.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description: "Single file path, JSON object with { path }, or JSON array.",
        }),
        Type.Array(Type.Union([Type.String(), HashFileSchema]), {
          description: "Multi-read payload. Each entry MAY include offset/limit and search options.",
        }),
      ]),
    }),
    renderResult(result: AgentToolResult<unknown>, options: ToolRenderResultOptions, theme: Theme) {
      return renderReadHash(result, options, theme);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const files = normalizeInput(params.files);
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "Invalid input: no readable files provided." }],
          isError: true,
          details: { files: [] },
        };
      }
      return executeReadHash(ctx.cwd, files);
    },
  });
}
