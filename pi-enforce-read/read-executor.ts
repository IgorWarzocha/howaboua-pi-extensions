import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import type { FileInput, ReadFileDetail } from "./read-tool-types.js";
import { detectImageMimeType, resolvePath } from "./utils.js";

type ExecuteReadFilesArgs = {
  toolCallId: string;
  files: FileInput[];
  signal?: AbortSignal;
  onUpdate?: (...args: any[]) => void;
  ctx: { cwd: string };
};

export async function executeReadFiles({ toolCallId, files, signal, onUpdate, ctx }: ExecuteReadFilesArgs) {
  const output: (TextContent | ImageContent)[] = [];
  const details: ReadFileDetail[] = [];

  for (const file of files) {
    try {
      const absolutePath = resolvePath(file.path, ctx.cwd);
      await access(absolutePath, constants.R_OK);
      const buffer = await readFile(absolutePath);
      const mimeType = detectImageMimeType(buffer);

      let result: { content: (TextContent | ImageContent)[]; details: unknown };

      if (mimeType) {
        const base64 = buffer.toString("base64");
        result = {
          content: [
            { type: "text", text: `Read image file [${mimeType}]` },
            { type: "image", data: base64, mimeType }
          ],
          details: {}
        };
      } else {
        const readTool = createReadTool(ctx.cwd);
        result = await readTool.execute(
          toolCallId,
          { path: file.path, offset: file.offset, limit: file.limit },
          signal,
          onUpdate
        );
      }

      if (files.length > 1) {
        output.push({ type: "text", text: `--- ${file.path} ---` });
      }
      output.push(...result.content);
      details.push({
        path: file.path,
        offset: file.offset,
        limit: file.limit,
        mimeType: mimeType ?? undefined,
        details: result.details
      });
    } catch (err: any) {
      const error = err?.message ?? String(err);
      output.push({
        type: "text",
        text: `--- ${file.path} ---\nERROR: ${error}`
      });
      details.push({ path: file.path, offset: file.offset, limit: file.limit, error });
    }
  }

  return {
    content: output,
    details: { files: details }
  };
}
