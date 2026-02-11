import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import type { FileInput, ReadFileDetail } from "./read-tool-types.js";
import { detectImageMimeType, resolvePath } from "./utils.js";

type SearchMatch = {
  line: number;
  text: string;
};

type SearchResult = {
  content: TextContent[];
  matches: number;
};

const MAX_ALLOWED_MATCHES = 1000;

function createMatcher(file: FileInput): (line: string) => boolean {
  const search = file.search;
  if (!search) {
    throw new Error("Search query is required for search mode.");
  }
  const caseSensitive = file.caseSensitive === true;
  if (file.regex) {
    const flags = caseSensitive ? "" : "i";
    let expression: RegExp;
    try {
      expression = new RegExp(search, flags);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid regex pattern '${search}': ${message}`);
    }
    return (line: string) => expression.test(line);
  }
  const needle = caseSensitive ? search : search.toLowerCase();
  return (line: string) => {
    const hay = caseSensitive ? line : line.toLowerCase();
    return hay.includes(needle);
  };
}

function findMatches(lines: string[], file: FileInput): SearchMatch[] {
  const matcher = createMatcher(file);
  const requested = file.maxMatches ?? 200;
  const capped = Math.min(Math.max(1, requested), MAX_ALLOWED_MATCHES);
  const matches: SearchMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!matcher(lines[i])) continue;
    matches.push({ line: i + 1, text: lines[i] });
    if (matches.length >= capped) break;
  }
  return matches;
}

function buildSearchResult(file: FileInput, text: string): SearchResult {
  const lines = text.split("\n");
  const matches = findMatches(lines, file);
  const before = Math.max(0, file.contextBefore ?? 0);
  const after = Math.max(0, file.contextAfter ?? 0);
  const lineSet = new Set<number>();
  for (const match of matches) {
    const start = Math.max(1, match.line - before);
    const end = Math.min(lines.length, match.line + after);
    for (let line = start; line <= end; line++) {
      lineSet.add(line);
    }
  }
  const selected = Array.from(lineSet).sort((a, b) => a - b);
  const output: string[] = [];
  output.push(`Search results for '${file.search}'`);
  output.push(`Matches: ${matches.length}`);
  if (selected.length === 0) {
    output.push("No matching lines.");
    return { content: [{ type: "text", text: output.join("\n") }], matches: 0 };
  }
  let previous = 0;
  for (const line of selected) {
    if (previous !== 0 && line > previous + 1) {
      output.push("...");
    }
    output.push(`${line}| ${lines[line - 1]}`);
    previous = line;
  }
  return { content: [{ type: "text", text: output.join("\n") }], matches: matches.length };
}

type ExecuteReadFilesArgs = {
  toolCallId: string;
  files: FileInput[];
  signal?: AbortSignal;
  onUpdate?: (...args: any[]) => void;
  ctx: { cwd: string };
};

export async function executeReadFiles({
  toolCallId,
  files,
  signal,
  onUpdate,
  ctx,
}: ExecuteReadFilesArgs) {
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
        if (file.search) {
          throw new Error("Search mode is not supported for images. Remove 'search' or use a text file path.");
        }
        const base64 = buffer.toString("base64");
        result = {
          content: [
            { type: "text", text: `Read image file [${mimeType}]` },
            { type: "image", data: base64, mimeType },
          ],
          details: {},
        };
      } else {
        if (file.search) {
          const searchText = buffer.toString("utf-8");
          const searchResult = buildSearchResult(file, searchText);
          result = {
            content: searchResult.content,
            details: {
              mode: "search",
              search: file.search,
              regex: file.regex === true,
              caseSensitive: file.caseSensitive === true,
              contextBefore: file.contextBefore ?? 0,
              contextAfter: file.contextAfter ?? 0,
              matches: searchResult.matches,
            },
          };
        } else {
          const readTool = createReadTool(ctx.cwd);
          result = await readTool.execute(
            toolCallId,
            { path: file.path, offset: file.offset, limit: file.limit },
            signal,
            onUpdate,
          );
        }
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
        search: file.search,
        regex: file.regex,
        matches:
          typeof result.details === "object" &&
          result.details !== null &&
          "matches" in result.details &&
          typeof (result.details as { matches?: unknown }).matches === "number"
            ? ((result.details as { matches: number }).matches as number)
            : undefined,
        details: result.details,
      });
    } catch (err: any) {
      const error = err?.message ?? String(err);
      output.push({
        type: "text",
        text: `--- ${file.path} ---\nERROR: ${error}`,
      });
      details.push({ path: file.path, offset: file.offset, limit: file.limit, error });
    }
  }

  return {
    content: output,
    details: { files: details },
  };
}
