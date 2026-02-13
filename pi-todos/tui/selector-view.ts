import { Text, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter } from "../types.js";
import { isTodoClosed, renderAssignmentSuffix } from "../format.js";

export function buildHeader(
  theme: Theme,
  todos: TodoFrontMatter[],
  mode: "open" | "closed",
): string {
  if (mode === "open") return theme.fg("accent", theme.bold(`Open todos (${todos.length})`));
  const abandoned = todos.filter((todo) => todo.status.toLowerCase() === "abandoned").length;
  const done = todos.filter((todo) => todo.status.toLowerCase() === "done").length;
  const closed = todos.filter((todo) => todo.status.toLowerCase() === "closed").length;
  return theme.fg(
    "accent",
    theme.bold(
      `Closed todos (${todos.length}; abandoned ${abandoned}, done ${done}, closed ${closed})`,
    ),
  );
}

export function buildHints(theme: Theme, mode: "open" | "closed", leaderActive = false): string {
  if (leaderActive) {
    return theme.fg(
      "warning",
      mode === "open"
        ? "Leader: c create • w work • r refine • v view • x cancel"
        : "Leader: c create • w work • r refine • v view • a sweep abandoned • d sweep completed • x cancel",
    );
  }
  return theme.fg(
    "dim",
    "Press / to search • ↑↓ or j/k select • Enter view • Tab switch list • Ctrl+X leader • Esc close",
  );
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
  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(maxVisible / 2), totalItems - maxVisible),
  );
  const endIndex = Math.min(startIndex + maxVisible, totalItems);
  for (let i = startIndex; i < endIndex; i += 1) {
    if (i === 0) {
      const prefix = i === selectedIndex ? theme.fg("success", "→ ") : "  ";
      const plusSign = theme.fg("success", "+");
      const text =
        i === selectedIndex
          ? theme.fg("accent", " Create new todo...")
          : theme.fg("dim", " Create new todo...");
      listContainer.addChild(new Text(prefix + plusSign + text, 0, 0));
      continue;
    }
    const todo = todos[i - 1];
    if (!todo) continue;
    const isSelected = i === selectedIndex;
    const closed = isTodoClosed(todo.status);
    const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
    const titleColor = isSelected ? "accent" : closed ? "dim" : "text";
    const statusColor =
      todo.status.toLowerCase() === "abandoned" ? "error" : closed ? "dim" : "success";
    const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
    const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
    const line =
      prefix +
      theme.fg(titleColor, todo.title || "(untitled)") +
      theme.fg("muted", tagText) +
      assignmentText +
      " " +
      theme.fg(statusColor, `(${todo.status || "open"})`);
    listContainer.addChild(new Text(line, 0, 0));
  }
  if (startIndex > 0 || endIndex < totalItems) {
    listContainer.addChild(
      new Text(theme.fg("dim", `  (${selectedIndex + 1}/${totalItems})`), 0, 0),
    );
  }
}

export function renderAll(
  tui: TUI,
  headerText: Text,
  hintText: Text,
  listContainer: { clear: () => void; addChild: (node: Text) => void },
  theme: Theme,
  todos: TodoFrontMatter[],
  selectedIndex: number,
  mode: "open" | "closed",
  currentSessionId?: string,
  leaderActive = false,
): void {
  headerText.setText(buildHeader(theme, todos, mode));
  hintText.setText(buildHints(theme, mode, leaderActive));
  renderList(listContainer, theme, todos, selectedIndex, currentSessionId);
  tui.requestRender();
}
