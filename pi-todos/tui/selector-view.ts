import { Text, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter } from "../types.js";
import { formatTodoId, isTodoClosed, renderAssignmentSuffix } from "../format.js";

export function buildHeader(theme: Theme, todos: TodoFrontMatter[]): string {
    const openCount = todos.filter((todo) => !isTodoClosed(todo.status)).length;
    const closedCount = todos.length - openCount;
    return theme.fg("accent", theme.bold(`Todos (${openCount} open, ${closedCount} closed)`));
}

export function buildHints(theme: Theme, mode: "open" | "closed"): string {
    const sweep = mode === "closed" ? " • Ctrl+Alt+A sweep abandoned • Ctrl+Alt+D sweep completed" : "";
    return theme.fg("dim", `Type to search • ↑↓ select • Enter actions • Tab switch list${sweep} • Ctrl+Alt+C create • Ctrl+Alt+W work • Ctrl+Alt+R refine • Esc close`);
}

export function renderList(
    listContainer: { clear: () => void; addChild: (node: Text) => void },
    theme: Theme,
    todos: TodoFrontMatter[],
    selectedIndex: number,
    currentSessionId?: string,
): void {
    listContainer.clear();
    const totalItems = todos.length + 1;
    const maxVisible = 10;
    const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), totalItems - maxVisible));
    const endIndex = Math.min(startIndex + maxVisible, totalItems);
    for (let i = startIndex; i < endIndex; i += 1) {
        if (i === 0) {
            const prefix = i === selectedIndex ? theme.fg("success", "→ ") : "  ";
            const plusSign = theme.fg("success", "+");
            const text = i === selectedIndex ? theme.fg("accent", " Create new todo...") : theme.fg("dim", " Create new todo...");
            listContainer.addChild(new Text(prefix + plusSign + text, 0, 0));
            continue;
        }
        const todo = todos[i - 1];
        if (!todo) continue;
        const isSelected = i === selectedIndex;
        const closed = isTodoClosed(todo.status);
        const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
        const titleColor = isSelected ? "accent" : closed ? "dim" : "text";
        const statusColor = todo.status.toLowerCase() === "abandoned" ? "error" : closed ? "dim" : "success";
        const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
        const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
        const line = prefix + theme.fg("accent", formatTodoId(todo.id)) + " " + theme.fg(titleColor, todo.title || "(untitled)") + theme.fg("muted", tagText) + assignmentText + " " + theme.fg(statusColor, `(${todo.status || "open"})`);
        listContainer.addChild(new Text(line, 0, 0));
    }
    if (startIndex > 0 || endIndex < totalItems) {
        listContainer.addChild(new Text(theme.fg("dim", `  (${selectedIndex + 1}/${totalItems})`), 0, 0));
    }
}

export function renderAll(tui: TUI, headerText: Text, hintText: Text, listContainer: { clear: () => void; addChild: (node: Text) => void }, theme: Theme, todos: TodoFrontMatter[], selectedIndex: number, mode: "open" | "closed", currentSessionId?: string): void {
    headerText.setText(buildHeader(theme, todos));
    hintText.setText(buildHints(theme, mode));
    renderList(listContainer, theme, todos, selectedIndex, currentSessionId);
    tui.requestRender();
}
