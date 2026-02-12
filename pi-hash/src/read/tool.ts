import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { normalizeInput } from "./normalizer.js";
import { executeReadHash } from "./executor.js";
import { renderReadHash } from "./renderer.js";
import { HashFileSchema } from "./types.js";

export function registerReadHashTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read_hash",
    label: "Read File(s) [Hashline]",
    description:
      "Read one or more files with LINEHASH| anchored prefixes for robust editing. Supports multi-file reads, offset/limit, and in-file search (search/regex/caseSensitive/contextBefore/contextAfter/maxMatches). You MUST use this tool for file inspection. Lines are prefixed with LINE_NUMBER + HASH + '|' for use with apply_hash anchors.",
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
