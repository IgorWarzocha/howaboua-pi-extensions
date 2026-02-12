import { keyHint, renderDiff } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { ApplySummary } from "./types.js";

function splitContentLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function formatDiffLine(
  prefix: "+" | "-" | " ",
  lineNumber: number | undefined,
  width: number,
  text: string,
): string {
  const num =
    lineNumber === undefined ? "".padStart(width, " ") : String(lineNumber).padStart(width, " ");
  return `${prefix}${num} ${text}`;
}

export function buildNumberedDiff(oldContent: string, newContent: string): string {
  const oldLines = splitContentLines(oldContent);
  const newLines = splitContentLines(newContent);

  if (oldLines.length === 0 && newLines.length === 0) return "";

  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start += 1;
  }

  if (start === oldLines.length && start === newLines.length) {
    return formatDiffLine(" ", 1, 1, "(no changes)");
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const width = String(Math.max(oldLines.length, newLines.length, 1)).length;
  const lines: string[] = [];

  const contextBeforeStart = Math.max(0, start - 3);
  if (contextBeforeStart > 0) {
    lines.push(formatDiffLine(" ", undefined, width, "..."));
  }

  for (let index = contextBeforeStart; index < start; index += 1) {
    lines.push(formatDiffLine(" ", index + 1, width, oldLines[index]));
  }

  for (let index = start; index <= oldEnd; index += 1) {
    lines.push(formatDiffLine("-", index + 1, width, oldLines[index]));
  }

  for (let index = start; index <= newEnd; index += 1) {
    lines.push(formatDiffLine("+", index + 1, width, newLines[index]));
  }

  const suffixStart = oldEnd + 1;
  const suffixShownEnd = Math.min(oldLines.length, suffixStart + 3);
  for (let index = suffixStart; index < suffixShownEnd; index += 1) {
    lines.push(formatDiffLine(" ", index + 1, width, oldLines[index]));
  }

  if (suffixShownEnd < oldLines.length) {
    lines.push(formatDiffLine(" ", undefined, width, "..."));
  }

  return lines.join("\n");
}

export function formatSummary(summary: ApplySummary): string {
  const lines = ["Success. Updated the following files:"];
  for (const file of summary.added) lines.push(`A ${file}`);
  for (const file of summary.modified) lines.push(`M ${file}`);
  for (const file of summary.deleted) lines.push(`D ${file}`);
  return `${lines.join("\n")}\n`;
}

export function renderApplyPatchCall(
  args: unknown,
  parsePatch: (text: string) => any[],
  theme: any,
): Text {
  const patchText =
    typeof (args as { patchText?: unknown })?.patchText === "string"
      ? ((args as { patchText?: string }).patchText ?? "")
      : "";

  if (!patchText) {
    return new Text(
      `${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", "(awaiting patch)")}`,
      0,
      0,
    );
  }

  try {
    const hunks = parsePatch(patchText);
    const addCount = hunks.filter((h: any) => h.type === "add").length;
    const updateCount = hunks.filter((h: any) => h.type === "update").length;
    const deleteCount = hunks.filter((h: any) => h.type === "delete").length;
    const files = hunks.map((h: any) => h.filePath);
    const preview = files.slice(0, 3).join(", ");
    const suffix = files.length > 3 ? `, +${files.length - 3} more` : "";
    const opSummary = `A:${addCount} M:${updateCount} D:${deleteCount}`;
    return new Text(
      `${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", `(${opSummary})`)}` +
        `${preview ? `\n${theme.fg("accent", preview)}${theme.fg("muted", suffix)}` : ""}`,
      0,
      0,
    );
  } catch {
    return new Text(
      `${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", "(patching)")}`,
      0,
      0,
    );
  }
}

export function renderApplyPatchResult(
  result: any,
  expanded: boolean,
  isPartial: boolean,
  theme: any,
): Text {
  const rawTextContent = (result.content ?? [])
    .filter((block: any) => block.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text ?? "")
    .join("\n")
    .trim();

  const summaryLines = rawTextContent.split("\n");
  const textContent = summaryLines.length > 0 && summaryLines[0] === "Success. Updated the following files:"
    ? summaryLines.filter((line, index) => index === 0 || !/^[AMD] /.test(line)).join("\n").trim()
    : rawTextContent;

  if (isPartial) {
    return new Text(theme.fg("warning", textContent || "Applying patch..."), 0, 0);
  }

  let output = textContent
    ? result.isError
      ? textContent
      : theme.fg("toolOutput", textContent)
    : "";
  const summary = result.details as ApplySummary | undefined;
  const fileDiffs = summary?.fileDiffs ?? [];

  if (result.isError) {
    return new Text(output || "Error", 0, 0);
  }

  if (fileDiffs.length > 0) {
    const visibleFileCount = expanded ? fileDiffs.length : Math.min(fileDiffs.length, 2);

    for (const fileDiff of fileDiffs.slice(0, visibleFileCount)) {
      const header = fileDiff.moveFrom
        ? `${fileDiff.status} ${fileDiff.path} (from ${fileDiff.moveFrom})`
        : `${fileDiff.status} ${fileDiff.path}`;

      const renderedDiff = renderDiff(fileDiff.diff);
      const diffLines = renderedDiff.split("\n");
      const visibleDiffLines = expanded ? diffLines.length : Math.min(diffLines.length, 30);
      const shownDiff = diffLines.slice(0, visibleDiffLines).join("\n");

      output += `${output ? "\n\n" : ""}${theme.fg("accent", header)}\n${shownDiff}`;

      if (!expanded && diffLines.length > visibleDiffLines) {
        output += `\n${theme.fg("muted", `... (${diffLines.length - visibleDiffLines} more diff lines, ${keyHint("expandTools", "to expand")})`)}`;
      }
    }

    if (!expanded && fileDiffs.length > visibleFileCount) {
      output += `\n\n${theme.fg("muted", `... (${fileDiffs.length - visibleFileCount} more changed files, ${keyHint("expandTools", "to expand")})`)}`;
    }
  }

  return new Text(output || theme.fg("toolOutput", "No output"), 0, 0);
}
