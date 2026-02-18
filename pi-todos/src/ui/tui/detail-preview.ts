import { Markdown, TUI, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { TodoRecord } from "../../core/types.js";
import { formatChecklistProgress, isTodoClosed, renderChecklist } from "../../format/index.js";
import { parseTodoContent } from "../../core/parser.js";
import { noun } from "../../ui/gui/type.js";

interface RelatedRow {
  type: string;
  title: string;
  status: string;
  progress: string;
  file: string;
}

export class TodoDetailPreviewComponent {
  private todo: TodoRecord;
  private theme: Theme;
  private markdown: Markdown;
  private scrollOffset = 0;
  private viewHeight = 0;
  private totalLines = 0;
  private tui: TUI;
  private rows: RelatedRow[];
  private selected = 0;

  constructor(tui: TUI, theme: Theme, todo: TodoRecord) {
    this.tui = tui;
    this.theme = theme;
    this.todo = todo;
    this.rows = this.relatedRows();
    this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
  }

  hasRelated(): boolean {
    return this.rows.length > 0;
  }

  moveRelated(delta: number): void {
    if (!this.rows.length) return;
    const next = this.selected + delta;
    if (next < 0) {
      this.selected = this.rows.length - 1;
      this.tui.requestRender();
      return;
    }
    if (next >= this.rows.length) {
      this.selected = 0;
      this.tui.requestRender();
      return;
    }
    this.selected = next;
    this.tui.requestRender();
  }

  getSelectedRelated(): TodoRecord | null {
    const row = this.rows[this.selected];
    if (!row) return null;
    try {
      const raw = readFileSync(row.file, "utf8");
      const id = path.basename(row.file, ".md");
      return parseTodoContent(raw, id);
    } catch {
      return null;
    }
  }

  private getMarkdownText(): string {
    const body = this.todo.body?.trim();
    const checklist = this.todo.checklist?.length
      ? renderChecklist(this.theme, this.todo.checklist).join("\n")
      : "";
    const main = body ? body : "_No details yet._";
    return [checklist, main].filter((item) => Boolean(item)).join("\n\n---\n\n");
  }

  private relatedRows(): RelatedRow[] {
    const links = this.todo.links;
    if (!links) return [];
    const rows: RelatedRow[] = [];
    this.pushRows(rows, links.prds, "PRD");
    this.pushRows(rows, links.specs, "SPEC");
    this.pushRows(rows, links.todos, "TODO");
    this.pushRows(rows, links.reads, "READ");
    rows.sort(
      (a, b) => this.groupRank(a.type) - this.groupRank(b.type) || a.title.localeCompare(b.title),
    );
    return rows;
  }

  private pushRows(rows: RelatedRow[], list: string[] | undefined, fallbackType: string): void {
    if (!list?.length) return;
    const root = this.todo.links?.root_abs || "";
    for (let index = 0; index < list.length; index += 1) {
      const rel = list[index];
      const file = root ? path.resolve(root, rel) : rel;
      rows.push(this.relatedRow(file, fallbackType));
    }
  }

  private relatedRow(file: string, fallbackType: string): RelatedRow {
    const root = this.todo.links?.root_abs || "";
    const value = root ? path.relative(root, file).replaceAll("\\", "/") : file;
    try {
      const raw = readFileSync(file, "utf8");
      const id = path.basename(file, ".md");
      const parsed = parseTodoContent(raw, id);
      const rowType = (parsed.type || fallbackType.toLowerCase()).toUpperCase();
      const rowTitle = parsed.title || value || "(untitled)";
      const rowStatus = parsed.status || "unknown";
      const rowProgress = rowType === "TODO" ? formatChecklistProgress(parsed) : "";
      return {
        type: rowType,
        title: this.cleanCell(rowTitle),
        status: this.cleanCell(rowStatus),
        progress: rowProgress,
        file,
      };
    } catch {
      return {
        type: fallbackType,
        title: this.cleanCell(value || "(missing)"),
        status: "missing",
        progress: "",
        file,
      };
    }
  }

  private relatedLines(width: number): string[] {
    const heading =
      this.theme.fg("accent", "Related items") +
      this.theme.fg("dim", "  / next • ? prev • o open related • b back");
    if (!this.rows.length) return [heading, "", this.theme.fg("dim", "No related items.")];
    const lines = [heading, ""];
    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index];
      const marker = row.progress ? `${row.type}${row.progress}` : row.type;
      const pointer =
        index === this.selected ? this.theme.fg("accent", "→") : this.theme.fg("dim", "·");
      const prefix = `${pointer} ${marker} `;
      const titleWidth = Math.max(10, width - visibleWidth(prefix));
      const wrapped = this.wrap(row.title, titleWidth);
      const first = wrapped[0] || "";
      lines.push(`${prefix}${first}`);
      for (let i = 1; i < wrapped.length; i += 1) {
        lines.push(`${" ".repeat(Math.max(0, visibleWidth(prefix)))}${wrapped[i]}`);
      }
      lines.push(this.theme.fg("dim", `  status: ${row.status}`));
      lines.push("");
    }
    return lines;
  }

  private wrap(value: string, width: number): string[] {
    if (width <= 1) return [value];
    const words = value.split(/\s+/).filter((item) => item.length > 0);
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = "";
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      const next = line ? `${line} ${word}` : word;
      if (visibleWidth(next) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      if (visibleWidth(word) <= width) {
        line = word;
        continue;
      }
      let chunk = "";
      for (let i = 0; i < word.length; i += 1) {
        const candidate = chunk + word[i];
        if (visibleWidth(candidate) <= width) {
          chunk = candidate;
          continue;
        }
        lines.push(chunk);
        chunk = word[i];
      }
      line = chunk;
    }
    if (line) lines.push(line);
    return lines;
  }

  private cleanCell(value: string): string {
    return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
  }

  private groupRank(type: string): number {
    if (type === "PRD") return 0;
    if (type === "SPEC") return 1;
    if (type === "TODO") return 2;
    if (type === "READ") return 3;
    return 4;
  }

  render(width: number, maxHeight: number): string[] {
    const headerLines = 3;
    const borderLines = 2;
    const innerWidth = Math.max(10, width - 2);
    const contentHeight = Math.max(1, maxHeight - headerLines - borderLines);
    const markdownLines = this.markdown.render(innerWidth);
    const relatedLines = this.relatedLines(innerWidth);
    const contentLines = [...relatedLines, "", ...markdownLines];
    this.totalLines = contentLines.length;
    this.viewHeight = contentHeight;
    const maxScroll = Math.max(0, this.totalLines - contentHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
    const visibleLines = contentLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);
    const lines: string[] = [];
    lines.push(this.buildTitleLine(innerWidth));
    lines.push(this.buildMetaLine(innerWidth));
    lines.push("");
    for (const line of visibleLines) lines.push(truncateToWidth(line, innerWidth));
    while (lines.length < headerLines + contentHeight) lines.push("");
    const borderColor = (text: string) => this.theme.fg("borderMuted", text);
    const top = borderColor(`┌${"─".repeat(innerWidth)}┐`);
    const bottom = borderColor(`└${"─".repeat(innerWidth)}┘`);
    const framedLines = lines.map((line) => {
      const truncated = truncateToWidth(line, innerWidth);
      const padding = Math.max(0, innerWidth - visibleWidth(truncated));
      return borderColor("│") + truncated + " ".repeat(padding) + borderColor("│");
    });
    return [top, ...framedLines, bottom].map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {
    this.rows = this.relatedRows();
    if (this.selected >= this.rows.length) this.selected = Math.max(0, this.rows.length - 1);
    this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
  }

  scrollBy(delta: number): void {
    const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll));
  }

  private buildTitleLine(width: number): string {
    const titleText = this.todo.title ? ` ${this.todo.title} ` : ` ${noun(this.todo)} `;
    const titleWidth = visibleWidth(titleText);
    if (titleWidth >= width)
      return truncateToWidth(this.theme.fg("accent", titleText.trim()), width);
    const leftWidth = Math.max(0, Math.floor((width - titleWidth) / 2));
    const rightWidth = Math.max(0, width - titleWidth - leftWidth);
    return (
      this.theme.fg("borderMuted", "─".repeat(leftWidth)) +
      this.theme.fg("accent", titleText) +
      this.theme.fg("borderMuted", "─".repeat(rightWidth))
    );
  }

  private buildMetaLine(width: number): string {
    const status = this.todo.status || "open";
    const statusColor = isTodoClosed(status) ? "dim" : "success";
    const tagText = this.todo.tags.length ? this.todo.tags.join(", ") : "no tags";
    const scroll =
      this.totalLines > this.viewHeight
        ? ` ${this.scrollOffset + 1}-${Math.min(this.totalLines, this.scrollOffset + this.viewHeight)}/${this.totalLines}`
        : "";
    const line =
      this.theme.fg(statusColor, status) +
      this.theme.fg("muted", " • ") +
      this.theme.fg("muted", tagText) +
      this.theme.fg("dim", scroll);
    return truncateToWidth(line, width);
  }
}
