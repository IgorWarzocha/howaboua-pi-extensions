import { Markdown, Text, TUI, getEditorKeybindings, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { TodoRecord, TodoOverlayAction } from "../types.js";
import { formatTodoId, isTodoClosed } from "../format.js";
import { renderChecklist, formatChecklistProgress } from "../format.js";

export class TodoDetailOverlayComponent {
    private todo: TodoRecord;
    private theme: Theme;
    private tui: TUI;
    private markdown: Markdown;
    private scrollOffset = 0;
    private viewHeight = 0;
    private totalLines = 0;
    private onAction: (action: TodoOverlayAction) => void;

    constructor(tui: TUI, theme: Theme, todo: TodoRecord, onAction: (action: TodoOverlayAction) => void) {
        this.tui = tui;
        this.theme = theme;
        this.todo = todo;
        this.onAction = onAction;
        this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
    }

    private getMarkdownText(): string {
        const body = this.todo.body?.trim();
        const checklist = this.todo.checklist?.length ? renderChecklist(this.theme, this.todo.checklist).join("\n") : "";
        if (checklist) {
            return `${checklist}\n\n---\n\n${body || "_No details yet._"}`;
        }
        return body ? body : "_No details yet._";
    }

    handleInput(keyData: string): void {
        const kb = getEditorKeybindings();
        if (kb.matches(keyData, "selectCancel")) {
            this.onAction("back");
            return;
        }
        if (kb.matches(keyData, "selectConfirm")) {
            if (this.todo.checklist?.length) {
                this.onAction("edit-checklist");
            } else {
                this.onAction("work");
            }
            return;
        }
        if (this.todo.checklist?.length && keyData === "w") {
            this.onAction("work");
            return;
        }
        if (kb.matches(keyData, "selectUp")) {
            this.scrollBy(-1);
            return;
        }
        if (kb.matches(keyData, "selectDown")) {
            this.scrollBy(1);
            return;
        }
        if (kb.matches(keyData, "selectPageUp")) {
            this.scrollBy(-this.viewHeight || -1);
            return;
        }
        if (kb.matches(keyData, "selectPageDown")) {
            this.scrollBy(this.viewHeight || 1);
            return;
        }
    }

    render(width: number): string[] {
        const maxHeight = this.getMaxHeight();
        const headerLines = 3;
        const footerLines = 3;
        const borderLines = 2;
        const innerWidth = Math.max(10, width - 2);
        const contentHeight = Math.max(1, maxHeight - headerLines - footerLines - borderLines);

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

        for (const line of visibleLines) {
            lines.push(truncateToWidth(line, innerWidth));
        }
        while (lines.length < headerLines + contentHeight) {
            lines.push("");
        }

        lines.push("");
        lines.push(this.buildActionLine(innerWidth));

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

    private getMaxHeight(): number {
        const rows = this.tui.terminal.rows || 24;
        return Math.max(10, Math.floor(rows * 0.8));
    }

    private buildTitleLine(width: number): string {
        const titleText = this.todo.title
            ? ` ${this.todo.title} `
            : ` Todo ${formatTodoId(this.todo.id)} `;
        const titleWidth = visibleWidth(titleText);
        if (titleWidth >= width) {
            return truncateToWidth(this.theme.fg("accent", titleText.trim()), width);
        }
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
        const line =
            this.theme.fg("accent", formatTodoId(this.todo.id)) +
            this.theme.fg("muted", " • ") +
            this.theme.fg(statusColor, status) +
            this.theme.fg("muted", " • ") +
            this.theme.fg("muted", tagText);
        return truncateToWidth(line, width);
    }

    private buildActionLine(width: number): string {
        if (this.todo.checklist?.length) {
            const edit = this.theme.fg("accent", "enter") + this.theme.fg("muted", " edit checklist");
            const work = this.theme.fg("dim", "w work");
            const back = this.theme.fg("dim", "esc back");
            let line = [edit, work, back].join(this.theme.fg("muted", " • "));
            if (this.totalLines > this.viewHeight) {
                const start = Math.min(this.totalLines, this.scrollOffset + 1);
                const end = Math.min(this.totalLines, this.scrollOffset + this.viewHeight);
                const scrollInfo = this.theme.fg("dim", ` ${start}-${end}/${this.totalLines}`);
                line += scrollInfo;
            }
            return truncateToWidth(line, width);
        }
        const work = this.theme.fg("accent", "enter") + this.theme.fg("muted", " work on todo");
        const back = this.theme.fg("dim", "esc back");
        const pieces = [work, back];

        let line = pieces.join(this.theme.fg("muted", " • "));
        if (this.totalLines > this.viewHeight) {
            const start = Math.min(this.totalLines, this.scrollOffset + 1);
            const end = Math.min(this.totalLines, this.scrollOffset + this.viewHeight);
            const scrollInfo = this.theme.fg("dim", ` ${start}-${end}/${this.totalLines}`);
            line += scrollInfo;
        }

        return truncateToWidth(line, width);
    }

    private scrollBy(delta: number): void {
        const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll));
    }
}
