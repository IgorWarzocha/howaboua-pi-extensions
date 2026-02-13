import { Text } from "@mariozechner/pi-tui";
import type { TodoToolDetails } from "../types.js";
import { appendExpandHint, renderTodoDetail, renderTodoList, splitTodosByAssignment } from "../format.js";

export function renderToolCall(args: Record<string, unknown>, theme: { fg: (color: string, value: string) => string; bold: (value: string) => string }) {
    const action = typeof args.action === "string" ? args.action : "";
    const title = typeof args.title === "string" ? args.title : "";
    let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", action);
    if (title) text += " " + theme.fg("dim", `"${title}"`);
    return new Text(text, 0, 0);
}

export function renderToolResult(result: { details?: unknown; content: Array<{ type: string; text?: string }> }, state: { expanded: boolean; isPartial: boolean }, theme: { fg: (color: string, value: string) => string }) {
    const details = result.details as TodoToolDetails | undefined;
    if (state.isPartial) return new Text(theme.fg("warning", "Processing..."), 0, 0);
    if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text || "" : "", 0, 0);
    if (details.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
    if (details.action === "list" || details.action === "list-all") {
        let text = renderTodoList(theme as never, details.todos, state.expanded, details.currentSessionId);
        if (!state.expanded) {
            const split = splitTodosByAssignment(details.todos);
            if (split.closedTodos.length) text = appendExpandHint(theme as never, text);
        }
        return new Text(text, 0, 0);
    }
    if (!("todo" in details)) return new Text(result.content[0]?.type === "text" ? result.content[0].text || "" : "", 0, 0);
    let text = renderTodoDetail(theme as never, details.todo, state.expanded);
    const label = details.action === "create" ? "Created" : details.action === "update" ? "Updated" : details.action === "append" ? "Appended to" : details.action === "claim" ? "Claimed" : details.action === "release" ? "Released" : null;
    if (label) {
        const lines = text.split("\n");
        lines[0] = theme.fg("success", "✓ ") + theme.fg("muted", `${label} `) + lines[0];
        text = lines.join("\n");
    }
    if (!state.expanded) text = appendExpandHint(theme as never, text);
    return new Text(text, 0, 0);
}
