import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Hunk, UpdateFileChunk, ApplySummary } from "./types.js";
import { resolvePatchPath } from "./path-utils.js";
import { buildNumberedDiff } from "./render.js";
import { normalizeForHash } from "./shared/normalize.js";
import { computeLineHash } from "./shared/hash.js";

type ReplaceOp = {
  start: number;
  oldLength: number;
  newLines: string[];
};

type AnchorError = Error & {
  expected?: string[];
  actual?: string[];
  suggest?: string;
};

function findContext(lines: string[], context: string, start: number): number {
  let index = Math.max(0, start);
  while (index < lines.length) {
    if (normalizeForHash(lines[index], false) === normalizeForHash(context, false)) return index;
    index += 1;
  }
  throw new Error(`Failed to find context '${context}'.`);
}

function linesEqual(fileLine: string, expected: string, expectedHash: string): boolean {
  if (computeLineHash(fileLine) !== expectedHash) return false;
  return normalizeForHash(fileLine, false) === normalizeForHash(expected, false);
}

function matchChunkAt(lines: string[], chunk: UpdateFileChunk, start: number): boolean {
  if (chunk.oldLines.length === 0) return true;
  if (start < 0 || start + chunk.oldLines.length > lines.length) return false;
  let index = 0;
  while (index < chunk.oldLines.length) {
    const fileLine = lines[start + index];
    const expected = chunk.oldLines[index];
    const anchor = chunk.oldAnchors[index];
    if (!linesEqual(fileLine, expected, anchor.hash)) return false;
    index += 1;
  }
  return true;
}

function spiral(seed: number, max: number): number[] {
  const out: number[] = [];
  if (seed >= 0 && seed < max) out.push(seed);
  let delta = 1;
  while (delta <= 100) {
    const up = seed + delta;
    const down = seed - delta;
    if (up >= 0 && up < max) out.push(up);
    if (down >= 0 && down < max) out.push(down);
    delta += 1;
  }
  return out;
}

function locate(lines: string[], chunk: UpdateFileChunk, seed: number): number {
  if (chunk.oldLines.length === 0) return Math.max(0, Math.min(seed, lines.length));
  const max = Math.max(0, lines.length - chunk.oldLines.length + 1);
  if (chunk.isEndOfFile) {
    const eofStart = lines.length - chunk.oldLines.length;
    if (matchChunkAt(lines, chunk, eofStart)) return eofStart;
    throw new Error("EOF chunk did not match file tail.");
  }
  const firstAnchor = chunk.oldAnchors[0];
  const target = firstAnchor ? seed : 0;
  if (target < 0 || target >= max) {
    throw new Error("Adjusted target is out of bounds.");
  }
  const candidates = spiral(target, max);
  const hits: number[] = [];
  for (const candidate of candidates) {
    if (matchChunkAt(lines, chunk, candidate)) hits.push(candidate);
  }
  if (hits.length === 0) {
    throw new Error("No anchor match found in +/-100 spiral window.");
  }
  const best = hits[0];
  const bestDistance = Math.abs(best - target);
  const tie = hits.find((value, index) => index > 0 && Math.abs(value - target) === bestDistance);
  if (tie !== undefined) {
    throw new Error(`Equidistant anchor collision at lines ${best + 1} and ${tie + 1}.`);
  }
  return best;
}

function applyReplacements(sourceLines: string[], replacements: ReplaceOp[]): string[] {
  const result = [...sourceLines];
  for (const replacement of [...replacements].sort((lhs, rhs) => rhs.start - lhs.start)) {
    result.splice(replacement.start, replacement.oldLength, ...replacement.newLines);
  }
  return result;
}

function collapseEmpty(lines: string[]): string[] {
  const out: string[] = [];
  let empty = false;
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (empty) continue;
      empty = true;
      out.push("");
      continue;
    }
    empty = false;
    out.push(line);
  }
  return out;
}

function anchorLines(lines: string[]): string[] {
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    out.push(`${index + 1}${computeLineHash(lines[index])}|${lines[index]}`);
    index += 1;
  }
  return out;
}

function anchorsFromContent(content: string): string[] {
  return anchorLines(content.split("\n"));
}

function mismatch(lines: string[], pathText: string, chunk: UpdateFileChunk): AnchorError {
  const first = chunk.oldAnchors[0];
  if (!first) return new Error(`Patch Error: Failed to locate anchored block in ${pathText}.`);
  const around = Math.max(1, first.line - 1);
  const start = Math.max(0, around - 4);
  const stop = Math.min(lines.length, around + 9);
  const sample: string[] = [];
  const expected: string[] = [];
  let oldIndex = 0;
  while (oldIndex < chunk.oldLines.length) {
    const anchor = chunk.oldAnchors[oldIndex];
    expected.push(`${anchor.line}${anchor.hash}|${chunk.oldLines[oldIndex]}`);
    oldIndex += 1;
  }
  let index = start;
  while (index < stop) {
    sample.push(`${index + 1}${computeLineHash(lines[index])}|${lines[index]}`);
    index += 1;
  }
  const error = new Error(
    `Patch Error: Failed to find anchored block in ${pathText}.` +
      `\nExpected first anchor: ${first.line}${first.hash}|${chunk.oldLines[0] ?? ""}`,
  ) as AnchorError;
  error.expected = expected;
  error.actual = sample;
  error.suggest = `Retry apply_patch with anchored lines from ${Math.max(1, start + 1)}-${stop}.`;
  return error;
}

function computeReplacements(originalLines: string[], filePath: string, chunks: UpdateFileChunk[]): ReplaceOp[] {
  const replacements: ReplaceOp[] = [];
  let drift = 0;
  for (const chunk of chunks) {
    const base = chunk.oldAnchors[0] ? chunk.oldAnchors[0].line - 1 : originalLines.length;
    const shifted = base + drift;
    const seed = chunk.changeContext
      ? findContext(originalLines, chunk.changeContext, Math.max(0, shifted))
      : shifted;
    let start = seed;
    try {
      start = locate(originalLines, chunk, seed);
    } catch {
      throw mismatch(originalLines, filePath, chunk);
    }
    replacements.push({ start, oldLength: chunk.oldLines.length, newLines: [...chunk.newLines] });
    drift += chunk.newLines.length - chunk.oldLines.length;
  }
  replacements.sort((lhs, rhs) => lhs.start - rhs.start);
  return replacements;
}

function deriveUpdatedContent(
  originalContent: string,
  filePath: string,
  chunks: UpdateFileChunk[],
): { content: string; anchors: string[] } {
  const originalLines = originalContent.split("\n");
  const replacements = computeReplacements(originalLines, filePath, chunks);
  const updatedLines = collapseEmpty(applyReplacements(originalLines, replacements));
  if (updatedLines[updatedLines.length - 1] !== "") updatedLines.push("");
  return { content: updatedLines.join("\n"), anchors: anchorLines(updatedLines) };
}

function upsertLive(summary: ApplySummary, pathText: string, anchors: string[]): void {
  let index = 0;
  while (index < summary.live.length) {
    if (summary.live[index].path === pathText) {
      summary.live[index] = { path: pathText, anchors };
      return;
    }
    index += 1;
  }
  summary.live.push({ path: pathText, anchors });
}

export async function applyHunks(cwd: string, hunks: Hunk[]): Promise<ApplySummary> {
  if (hunks.length === 0) {
    throw new Error("No files were modified. You MUST include at least one file section in the patch.");
  }
  const summary: ApplySummary = {
    added: [],
    modified: [],
    deleted: [],
    failed: [],
    live: [],
    fileDiffs: [],
  };
  for (const hunk of hunks) {
    try {
      if (hunk.type === "add") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        let exists = false;
        try {
          await fs.stat(target);
          exists = true;
        } catch {}
        if (exists) {
          throw new Error(
            `Add File target already exists: ${hunk.filePath}. ` +
              "You MUST NOT overwrite existing files via Add File. " +
              "You SHOULD use Update File for edits. " +
              "If you are sure you want full replacement, you MUST include Delete File + Add File for the same path in the SAME apply_patch call, with Delete File before Add File.",
          );
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, hunk.contents, "utf-8");
        summary.added.push(hunk.filePath);
        summary.fileDiffs.push({ status: "A", path: hunk.filePath, diff: buildNumberedDiff("", hunk.contents) });
        upsertLive(summary, hunk.filePath, anchorsFromContent(hunk.contents));
        continue;
      }
      if (hunk.type === "delete") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        await fs.readFile(target, "utf-8");
        await fs.unlink(target);
        summary.deleted.push(hunk.filePath);
        summary.fileDiffs.push({ status: "D", path: hunk.filePath, diff: "" });
        continue;
      }
      const source = resolvePatchPath(cwd, hunk.filePath);
      const originalContent = await fs.readFile(source, "utf-8");
      const next = deriveUpdatedContent(originalContent, source, hunk.chunks);
      const diff = buildNumberedDiff(originalContent, next.content);
      if (hunk.moveToPath) {
        const destination = resolvePatchPath(cwd, hunk.moveToPath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, next.content, "utf-8");
        try {
          await fs.unlink(source);
        } catch (error) {
          await fs.unlink(destination);
          throw error;
        }
        summary.modified.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "M", path: hunk.moveToPath, moveFrom: hunk.filePath, diff });
        upsertLive(summary, hunk.moveToPath, next.anchors);
        continue;
      }
      await fs.writeFile(source, next.content, "utf-8");
      summary.modified.push(hunk.filePath);
      summary.fileDiffs.push({ status: "M", path: hunk.filePath, diff });
      upsertLive(summary, hunk.filePath, next.anchors);
    } catch (error) {
      const typed = error as AnchorError;
      const message = error instanceof Error ? error.message : String(error);
      const failure = { path: hunk.filePath, error: message } as {
        path: string;
        error: string;
        expected?: string[];
        actual?: string[];
        suggest?: string;
      };
      if (typed.expected && typed.expected.length > 0) failure.expected = typed.expected;
      if (typed.actual && typed.actual.length > 0) failure.actual = typed.actual;
      if (typed.suggest) failure.suggest = typed.suggest;
      summary.failed.push(failure);
    }
  }
  return summary;
}
