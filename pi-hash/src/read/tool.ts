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
      "Read files with LINEHASH|CONTENT output for robust patching. LINEHASH means <line-number><4 lowercase hash chars> (example: '12abcz|const x = 1;'). This tool supports single-path reads and multi-read arrays. You MUST use read for file inspection before apply_patch updates. For Update hunks, you MUST copy anchored lines exactly for context (' ') and removal ('-') lines. You MUST NOT include LINEHASH prefixes or line numbers in '+' addition lines. You SHOULD NOT use bash (cat/head/tail/sed) for inspection when read can access the target paths.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description: "Single file path (string), a JSON object like { path }, or a JSON array of entries.",
        }),
        Type.Array(Type.Union([Type.String(), HashFileSchema]), {
          description: "Multi-read payload. Each entry MAY include offset, limit, search, regex, and context window options.",
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
