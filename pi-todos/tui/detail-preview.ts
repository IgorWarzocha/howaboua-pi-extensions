import { Markdown, TUI, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import path from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { TodoRecord } from "../types.js";
import { isTodoClosed, renderChecklist } from "../format.js";
import { noun } from "../gui/kind.js";

export class TodoDetailPreviewComponent {
  private todo: TodoRecord;
  private theme: Theme;
  private tui: TUI;
  private markdown: Markdown;
  private scrollOffset = 0;
  private viewHeight = 0;
  private totalLines = 0;

  constructor(tui: TUI, theme: Theme, todo: TodoRecord) {
    this.tui = tui;
    this.theme = theme;
    this.todo = todo;
    this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
  }

  private getMarkdownText(): string {
    const body = this.todo.body?.trim();
    const linked =
      this.todo.kind === "spec" && this.todo.links?.prds?.length
        ? [
            "## Linked PRDs",
            "",
            ...this.todo.links.prds.map((item) => {
              const root = this.todo.links?.root_abs || "";
              const full = root ? path.resolve(root, item) : item;
              return `- ${full}`;
            }),
          ].join("\n")
        : "";
    const checklist = this.todo.checklist?.length
      ? renderChecklist(this.theme, this.todo.checklist).join("\n")
      : "";
    const main = body ? body : "_No details yet._";
    const sections = [checklist, linked, main].filter((item) => Boolean(item));
    return sections.join("\n\n---\n\n");
  }

  render(width: number, maxHeight: number): string[] {
    const headerLines = 3;
    const borderLines = 2;
    const innerWidth = Math.max(10, width - 2);
    const contentHeight = Math.max(1, maxHeight - headerLines - borderLines);
    const markdownLines = this.markdown.render(innerWidth);
    this.totalLines = markdownLines.length;
    this.viewHeight = contentHeight;
    const maxScroll = Math.max(0, this.totalLines - contentHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
    const visibleLines = markdownLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);
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
