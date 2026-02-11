import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { normalizeFilesInput } from "./read-input-normalizer.js";
import { executeReadFiles } from "./read-executor.js";
import { renderReadResult } from "./read-renderer.js";
import { FileSchema } from "./read-tool-types.js";

export function registerReadTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read",
    label: "Read File(s)",
    description: "Read one or more files (text and images). You MUST use this tool for file inspection and MUST NOT use bash readers (cat/head/tail/less/more/nl/sed -n ...p). You SHOULD batch related file reads into ONE MULTI-READ call via the 'files' array instead of chaining many single-file read calls. MULTI-READ is RECOMMENDED for speed, context continuity, and lower tool-call overhead. You MAY provide a plain string path, a JSON-stringified payload, or a structured array. Images are returned as attachments. Text output is truncated to 2000 lines or 50KB; you SHOULD use offset/limit for targeted reads. In the TUI, Ctrl+O expands truncated output.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({ description: "Input payload. MAY be (a) a single file path string, (b) a JSON-stringified object, or (c) a JSON-stringified array. For multiple files, you SHOULD provide a single MULTI-READ payload instead of multiple sequential calls." }),
        Type.Array(Type.Union([Type.String(), FileSchema]))
      ])
    }),
    renderResult(result, options, theme: Theme) {
      return renderReadResult(result, options, theme);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const normalizedFiles = normalizeFilesInput(params.files);

      if (normalizedFiles.length === 0) {
        return {
          content: [{ type: "text", text: "Invalid input: no readable files were provided. You MUST provide at least one file path. You SHOULD use a MULTI-READ 'files' array for related files." }],
          isError: true,
          details: { files: [] },
        };
      }

      return executeReadFiles({ toolCallId, files: normalizedFiles, signal, onUpdate, ctx });
    }
  });
}
