import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Hunk, EditFileChunk, ApplySummary } from "./types.js";
import type { ApplyNoop } from "./types.js";
import { resolvePatchPath } from "./path-utils.js";
import { buildNumberedDiff } from "./render.js";
import { normalizeForHash } from "../shared/normalize.js";
import { computeLineHash } from "../shared/hash.js";
import { computeReplacementsWithHealing, type ReplaceOp } from "./healing.js";

type AnchorError = Error & {
  expected?: string[];
  actual?: string[];
  suggest?: string;
};

function sanitizeContext(context: string): string {
  return context.replace(/^\d+[a-z]{4}\|/, "");
}

function findContext(lines: string[], context: string, start: number): number {
  const target = sanitizeContext(context);
  let index = Math.max(0, start);
  while (index < lines.length) {
    if (normalizeForHash(lines[index], false) === normalizeForHash(target, false)) return index;
    index += 1;
  }
  throw new Error(`Failed to find context '${target}'.`);
}

function contextError(lines: string[], pathText: string, context: string, seed: number): AnchorError {
  const start = Math.max(0, seed - 4);
  const stop = Math.min(lines.length, seed + 9);
  const sample: string[] = [];
  let index = start;
  while (index < stop) {
    sample.push(`${index + 1}:${computeLineHash(lines[index])}|${lines[index]}`);
    index += 1;
  }
  const error = new Error(
    `Patch Error: Failed to resolve @@ context in ${pathText}.` +
      `\nContext text: ${sanitizeContext(context)}`,
  ) as AnchorError;
  error.expected = [sanitizeContext(context)];
  error.actual = sample;
  error.suggest = `Use an exact current line for @@ context or omit @@ and rely on anchored ' ' / '-' lines. Nearby anchored lines: ${Math.max(1, start + 1)}-${stop}.`;
  return error;
}

function linesEqual(fileLine: string, expected: string, expectedHash: string): boolean {
  if (computeLineHash(fileLine) !== expectedHash) return false;
  return normalizeForHash(fileLine, false) === normalizeForHash(expected, false);
}

function matchChunkAt(lines: string[], chunk: EditFileChunk, start: number): boolean {
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

function buildUniqueLineByHash(lines: string[]): Map<string, number> {
  const uniqueLineByHash = new Map<string, number>();
  const seenDuplicateHashes = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const hash = computeLineHash(lines[i]);
    if (seenDuplicateHashes.has(hash)) continue;
    if (uniqueLineByHash.has(hash)) {
      uniqueLineByHash.delete(hash);
      seenDuplicateHashes.add(hash);
    } else {
      uniqueLineByHash.set(hash, i + 1);
    }
  }
  return uniqueLineByHash;
}

function locate(
  lines: string[],
  chunk: EditFileChunk,
  seed: number,
  uniqueLineByHash: Map<string, number>,
): number {
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
    const firstAnchor = chunk.oldAnchors[0];
    if (firstAnchor) {
      const relocated = uniqueLineByHash.get(firstAnchor.hash);
      if (relocated !== undefined && matchChunkAt(lines, chunk, relocated - 1)) {
        return relocated - 1;
      }
    }
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
    out.push(`${index + 1}:${computeLineHash(lines[index])}|${lines[index]}`);
    index += 1;
  }
  return out;
}

function anchorsFromContent(content: string): string[] {
  return anchorLines(content.split("\n"));
}

function mismatch(lines: string[], pathText: string, chunk: EditFileChunk): AnchorError {
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
    expected.push(`${anchor.line}:${anchor.hash}|${chunk.oldLines[oldIndex]}`);
    oldIndex += 1;
  }
  let index = start;
  while (index < stop) {
    sample.push(`${index + 1}:${computeLineHash(lines[index])}|${lines[index]}`);
    index += 1;
  }
  const mismatchSet = new Map<number, { expected: string; actual: string }>();
  for (const anchor of chunk.oldAnchors) {
    const lineIdx = anchor.line - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const actualHash = computeLineHash(lines[lineIdx]);
      if (actualHash !== anchor.hash) {
        mismatchSet.set(anchor.line, { expected: anchor.hash, actual: actualHash });
      }
    }
  }
  const contextLines = new Set<number>();
  for (const lineNum of mismatchSet.keys()) {
    for (let i = Math.max(1, lineNum - 2); i <= Math.min(lines.length, lineNum + 2); i++) {
      contextLines.add(i);
    }
  }
  if (contextLines.size === 0) {
    for (let i = Math.max(1, around - 2); i <= Math.min(lines.length, around + 2); i++) {
      contextLines.add(i);
    }
  }
  const sortedContext = [...contextLines].sort((a, b) => a - b);
  const messageLines: string[] = [];
  const mismatchCount = mismatchSet.size;
  messageLines.push(
    `${mismatchCount > 0 ? mismatchCount : "Some"} line${mismatchCount !== 1 ? "s have" : " has"} changed since last read.` +
      ` Use the updated LINE:HASH references shown below (>>> marks changed lines).`,
  );
  messageLines.push("");
  let prevLine = 0;
  for (const lineNum of sortedContext) {
    if (prevLine > 0 && lineNum > prevLine + 1) {
      messageLines.push("    ...");
    }
    prevLine = lineNum;
    const content = lines[lineNum - 1];
    const hash = computeLineHash(content);
    const prefix = `${lineNum}:${hash}|${content}`;
    if (mismatchSet.has(lineNum)) {
      messageLines.push(`>>> ${prefix}`);
    } else {
      messageLines.push(`    ${prefix}`);
    }
  }
  const remaps: string[] = [];
  for (const [lineNum, { expected, actual }] of mismatchSet) {
    remaps.push(`\t${lineNum}:${expected} → ${lineNum}:${actual}`);
  }
  if (remaps.length > 0) {
    messageLines.push("");
    messageLines.push("Quick fix — replace stale refs:");
    messageLines.push(...remaps);
  }
  const error = new Error(
    `Patch Error: Failed to find anchored block in ${pathText}.\n` + messageLines.join("\n"),
  ) as AnchorError;
  error.expected = expected;
  error.actual = sample;
  error.suggest = remaps.length > 0
    ? `Replace stale refs: ${remaps.join("; ")}`
    : `Retry apply_patch with anchored lines from ${Math.max(1, start + 1)}-${stop}.`;
  return error;
}

function deriveUpdatedContentWithHealing(
  originalContent: string,
  filePath: string,
  chunks: EditFileChunk[],
  noops: ApplyNoop[],
): { content: string; anchors: string[] } {
  const originalLines = originalContent.split("\n");
  const replacements = computeReplacementsWithHealing(
    originalLines,
    filePath,
    chunks,
    noops,
    locate,
    findContext,
    contextError,
    mismatch,
    buildUniqueLineByHash,
  );
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
    created: [],
    edited: [],
    moved: [],
    deleted: [],
    failed: [],
    live: [],
    fileDiffs: [],
    noops: [],
  };
  for (const hunk of hunks) {
    try {
      if (hunk.type === "create") {
        const target = resolvePatchPath(cwd, hunk.filePath);
        let exists = false;
        try {
          await fs.stat(target);
          exists = true;
        } catch {}
        if (exists) {
          throw new Error(
            `Create File target already exists: ${hunk.filePath}. ` +
              "You MUST NOT overwrite existing files via Create File. " +
              "You SHOULD use Edit File for edits. " +
              "If you are sure you want full replacement, you MUST include Delete File + Create File for the same path in the SAME apply_patch call, with Delete File before Create File.",
          );
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, hunk.contents, "utf-8");
        summary.created.push(hunk.filePath);
        summary.fileDiffs.push({ status: "C", path: hunk.filePath, diff: buildNumberedDiff("", hunk.contents) });
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
      if (hunk.type === "move") {
        const source = resolvePatchPath(cwd, hunk.filePath);
        const originalContent = await fs.readFile(source, "utf-8");
        const destination = resolvePatchPath(cwd, hunk.moveToPath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, originalContent, "utf-8");
        try {
          await fs.unlink(source);
        } catch (error) {
          await fs.unlink(destination);
          throw error;
        }
        summary.moved.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "MV", path: hunk.moveToPath, moveFrom: hunk.filePath, diff: "" });
        upsertLive(summary, hunk.moveToPath, anchorsFromContent(originalContent));
        continue;
      }
      const source = resolvePatchPath(cwd, hunk.filePath);
      const originalContent = await fs.readFile(source, "utf-8");
      const next = deriveUpdatedContentWithHealing(originalContent, source, hunk.chunks, summary.noops);
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
        summary.edited.push(hunk.moveToPath);
        summary.fileDiffs.push({ status: "E", path: hunk.moveToPath, moveFrom: hunk.filePath, diff });
        upsertLive(summary, hunk.moveToPath, next.anchors);
        continue;
      }
      await fs.writeFile(source, next.content, "utf-8");
      summary.edited.push(hunk.filePath);
      summary.fileDiffs.push({ status: "E", path: hunk.filePath, diff });
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
