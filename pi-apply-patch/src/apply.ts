import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Hunk, UpdateFileChunk, ApplySummary } from "./types.js";
import { resolvePatchPath } from "./path-utils.js";
import { buildNumberedDiff } from "./render.js";

function normalizeUnicode(str: string): string {
  return str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(
      /[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g,
      " ",
    );
}

/**
 * Progressive comparison of two lines.
 */
function linesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.trimEnd() === b.trimEnd()) return true;
  if (a.trim() === b.trim()) return true;
  const normalize = (s: string) => normalizeUnicode(s.trim()).toLowerCase();
  return normalize(a) === normalize(b);
}

/**
 * Internal helper to find a pattern in lines starting from startIndex.
 */
function tryMatch(
  lines: string[],
  pattern: string[],
  startIndex: number,
  eof: boolean,
): number | undefined {
  if (eof) {
    const fromEnd = lines.length - pattern.length;
    if (fromEnd >= startIndex) {
      let matches = true;
      for (let j = 0; j < pattern.length; j++) {
        if (!linesMatch(lines[fromEnd + j], pattern[j])) {
          matches = false;
          break;
        }
      }
      if (matches) return fromEnd;
    }
  }

  for (let i = startIndex; i <= lines.length - pattern.length; i++) {
    let matches = true;
    for (let j = 0; j < pattern.length; j++) {
      if (!linesMatch(lines[i + j], pattern[j])) {
        matches = false;
        break;
      }
    }
    if (matches) return i;
  }
  return undefined;
}

/**
 * Find a sequence of lines in the file using fuzzy matching.
 */
export function seekSequence(
  lines: string[],
  pattern: string[],
  startIndex: number,
  eof = false,
): number | undefined {
  if (pattern.length === 0) return startIndex;
  return tryMatch(lines, pattern, startIndex, eof);
}

function applyReplacements(
  sourceLines: string[],
  replacements: Array<[start: number, oldLength: number, newLines: string[]]>,
): string[] {
  const result = [...sourceLines];
  for (const [start, oldLength, newLines] of [...replacements].sort(
    (lhs, rhs) => rhs[0] - lhs[0],
  )) {
    result.splice(start, oldLength, ...newLines);
  }
  return result;
}

export function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
): Array<[start: number, oldLength: number, newLines: string[]]> {
  const replacements: Array<[start: number, oldLength: number, newLines: string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (contextIndex === undefined) {
        throw new Error(
          `Failed to find context '${chunk.changeContext}' in ${filePath}.` +
            `\\nYou MUST use the 'read' tool to verify current file content before retrying.` +
            `\\nThe @@ context line MUST match an actual line in the file. Check for stale content or wrong indentation.`,
        );
      }
      lineIndex = contextIndex;
    }

    if (chunk.oldLines.length === 0) {
      const insertionIndex = originalLines.length;
      replacements.push([insertionIndex, 0, [...chunk.newLines]]);
      continue;
    }

    let oldPattern = [...chunk.oldLines];
    let newPattern = [...chunk.newLines];

    let found = seekSequence(originalLines, oldPattern, lineIndex, chunk.isEndOfFile);
    if (found === undefined && oldPattern[oldPattern.length - 1] === "") {
      oldPattern = oldPattern.slice(0, -1);
      if (newPattern[newPattern.length - 1] === "") newPattern = newPattern.slice(0, -1);
      found = seekSequence(originalLines, oldPattern, lineIndex, chunk.isEndOfFile);
    }

    if (found === undefined) {
      let diagnostic = "";
      const firstLinePattern = oldPattern[0];
      const potentialIndices: number[] = [];
      for (let i = 0; i < originalLines.length; i++) {
        if (linesMatch(originalLines[i], firstLinePattern)) potentialIndices.push(i);
      }

      if (potentialIndices.length > 0) {
        const bestIdx = potentialIndices.find((idx) => idx >= lineIndex) ?? potentialIndices[0];
        diagnostic += `\n\nPotential match started at line ${bestIdx + 1}, but failed on a subsequent line:`;

        if (bestIdx + oldPattern.length > originalLines.length) {
          diagnostic += `\n(Note: The patch block is ${oldPattern.length} lines, but only ${originalLines.length - bestIdx} lines remain in the file from this point)`;
        }

        for (let j = 0; j < oldPattern.length; j++) {
          const fileLine = originalLines[bestIdx + j];
          const patchLine = oldPattern[j];

          if (fileLine === undefined) {
            diagnostic += `\nLine ${bestIdx + j + 1} mismatch:\n  Expected: [${patchLine}]\n  Actual:   [End of File]`;
            break;
          }

          if (!linesMatch(fileLine, patchLine)) {
            diagnostic += `\nLine ${bestIdx + j + 1} mismatch:\n  Expected: [${patchLine}]\n  Actual:   [${fileLine}]`;
            break;
          }
        }
      } else {
        diagnostic += `\n\nCould not find even the first line of the block: "${firstLinePattern}"`;
      }

      throw new Error(
        `Patch Error: Failed to find the specified block in ${filePath}.${diagnostic}` +
          `\\n\\nYou MUST use the 'read' tool to verify current file content before retrying.` +
          `\\nYou MUST include 3+ unchanged context lines for unambiguous matching.` +
          `\\nYou MUST NOT guess content or ignore whitespace/indentation.`,
      );
    }

    replacements.push([found, oldPattern.length, newPattern]);
    lineIndex = found + oldPattern.length;
  }

  replacements.sort((lhs, rhs) => lhs[0] - rhs[0]);
  return replacements;
}

export function deriveUpdatedContent(
  originalContent: string,
  filePath: string,
  chunks: UpdateFileChunk[],
): string {
  const originalLines = originalContent.split("\n");
  if (originalLines[originalLines.length - 1] === "") originalLines.pop();

  const replacements = computeReplacements(originalLines, filePath, chunks);
  const updatedLines = applyReplacements(originalLines, replacements);
  if (updatedLines[updatedLines.length - 1] !== "") updatedLines.push("");

  return updatedLines.join("\n");
}

export async function applyHunks(cwd: string, hunks: Hunk[]): Promise<ApplySummary> {
  if (hunks.length === 0) {
    throw new Error(
      "No files were modified. You MUST include at least one file section in the patch.",
    );
  }

  const summary: ApplySummary = {
    added: [],
    modified: [],
    deleted: [],
    fileDiffs: [],
  };

  for (const hunk of hunks) {
    if (hunk.type === "add") {
      const target = resolvePatchPath(cwd, hunk.filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, hunk.contents, "utf-8");
      summary.added.push(hunk.filePath);
      summary.fileDiffs.push({
        status: "A",
        path: hunk.filePath,
        diff: buildNumberedDiff("", hunk.contents),
      });
      continue;
    }

    if (hunk.type === "delete") {
      const target = resolvePatchPath(cwd, hunk.filePath);
      const originalContent = await fs.readFile(target, "utf-8");
      await fs.unlink(target);
      summary.deleted.push(hunk.filePath);
      summary.fileDiffs.push({
        status: "D",
        path: hunk.filePath,
        diff: buildNumberedDiff(originalContent, ""),
      });
      continue;
    }

    const source = resolvePatchPath(cwd, hunk.filePath);
    const originalContent = await fs.readFile(source, "utf-8");
    const nextContent = deriveUpdatedContent(originalContent, source, hunk.chunks);
    const diff = buildNumberedDiff(originalContent, nextContent);

    if (hunk.moveToPath) {
      const destination = resolvePatchPath(cwd, hunk.moveToPath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, nextContent, "utf-8");
      await fs.unlink(source);
      summary.modified.push(hunk.moveToPath);
      summary.fileDiffs.push({
        status: "M",
        path: hunk.moveToPath,
        moveFrom: hunk.filePath,
        diff,
      });
      continue;
    }

    await fs.writeFile(source, nextContent, "utf-8");
    summary.modified.push(hunk.filePath);
    summary.fileDiffs.push({
      status: "M",
      path: hunk.filePath,
      diff,
    });
  }

  return summary;
}
