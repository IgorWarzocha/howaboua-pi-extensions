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
    description:
      "Read one or more files (text and images) and optionally search inside file contents. You MUST use this tool for file inspection and MUST NOT use bash readers (cat/head/tail/less/more/nl/sed -n ...p). For related files, you MUST prefer ONE MULTI-READ call via the 'files' array instead of chaining single-file calls. MULTI-READ is REQUIRED for parallel context gathering, lower latency, and fewer tool turns. You MAY provide a string path, a JSON-stringified object, a JSON-stringified array, or a structured array. For targeted extraction, you SHOULD set offset/limit. For in-file lookups, you SHOULD use per-file 'search' options (search/regex/caseSensitive/contextBefore/contextAfter/maxMatches) instead of separate grep calls when you already know candidate files. Images are returned as attachments. Text output is truncated to 2000 lines or 50KB. In the TUI, Ctrl+O expands output.",
    parameters: Type.Object({
      files: Type.Union([
        Type.String({
          description:
            "Input payload. MAY be (a) a single file path string, (b) a JSON-stringified object with { path } or { files: [...] }, or (c) a JSON-stringified array. For multiple files, you MUST provide a single MULTI-READ payload instead of sequential calls.",
        }),
        Type.Array(Type.Union([Type.String(), FileSchema]), {
          description:
            "MULTI-READ payload. You SHOULD pass all related files in one call. Each file object MAY include read slicing (offset/limit) and in-file search options (search/regex/caseSensitive/contextBefore/contextAfter/maxMatches).",
        }),
      ]),
    }),
    renderResult(result, options, theme: Theme) {
      return renderReadResult(result, options, theme);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const normalizedFiles = normalizeFilesInput(params.files);

      if (normalizedFiles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: no readable files were provided. You MUST provide at least one file path. You MUST use one MULTI-READ 'files' payload for related files.",
            },
          ],
          isError: true,
          details: { files: [] },
        };
      }

      return executeReadFiles({ toolCallId, files: normalizedFiles, signal, onUpdate, ctx });
    },
  });
}
