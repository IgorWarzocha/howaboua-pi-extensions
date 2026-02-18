import { Text, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoListMode, TodoRecord } from "../types.js";
import {
  deriveTodoStatus,
  formatChecklistProgress,
  isTodoClosed,
  renderAssignmentSuffix,
} from "../format.js";

export function buildHeader(theme: Theme, todos: TodoFrontMatter[], mode: TodoListMode): string {
  if (mode === "tasks") return theme.fg("accent", theme.bold(`Tasks (${todos.length})`));
  if (mode === "prds") return theme.fg("accent", theme.bold(`PRDs (${todos.length})`));
  if (mode === "specs") return theme.fg("accent", theme.bold(`Specs (${todos.length})`));
  return theme.fg("accent", theme.bold(`Done/Deprecated (${todos.length})`));
}

export function buildHints(theme: Theme, mode: TodoListMode, leaderActive = false): string {
  if (leaderActive) {
    return theme.fg(
      "warning",
      mode !== "closed"
        ? "More options: w work • c create • y review-all • r repair"
        : "More options: w work • y review-all • r repair • a sweep abandoned • d sweep completed",
    );
  }
  return theme.fg(
    "dim",
    "Press / to search • ↑↓ or j/k select • Enter view • Tab switch lists • Ctrl+X more options • Esc close",
  );
}

const LIST_ROWS = 9;

export function renderList(
  listContainer: { clear: () => void; addChild: (node: Text) => void },
  theme: Theme,
  todos: TodoFrontMatter[],
  selectedIndex: number,
  mode: TodoListMode,
  currentSessionId?: string,
): void {
  listContainer.clear();
  const create = mode !== "closed";
  const totalItems = todos.length + (create ? 1 : 0);
  const safeIndex = totalItems ? Math.max(0, Math.min(selectedIndex, totalItems - 1)) : 0;
  const startIndex = Math.max(
    0,
    Math.min(safeIndex - Math.floor(LIST_ROWS / 2), Math.max(0, totalItems - LIST_ROWS)),
  );
  const endIndex = Math.min(startIndex + LIST_ROWS, totalItems);
  const lines: string[] = [];
  for (let i = startIndex; i < endIndex; i += 1) {
    if (create && i === 0) {
      const prefix = i === safeIndex ? theme.fg("success", "→ ") : "  ";
      const plusSign = theme.fg("success", "+");
      const label = mode === "tasks" ? "todo" : mode === "prds" ? "prd" : "spec";
      const text =
        i === safeIndex
          ? theme.fg("accent", ` Create new ${label}...`)
          : theme.fg("dim", ` Create new ${label}...`);
      lines.push(prefix + plusSign + text);
      continue;
    }
    const offset = create ? 1 : 0;
    const todo = todos[i - offset];
    if (!todo) continue;
    const isSelected = i === safeIndex;
    const derived = deriveTodoStatus(todo as TodoRecord);
    const closed = isTodoClosed(derived);
    const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
    const titleColor = isSelected ? "accent" : closed ? "dim" : "text";
    const statusColor =
      derived.toLowerCase() === "abandoned" ? "error" : closed ? "dim" : "success";
    const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
    const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
    const progress = formatChecklistProgress(todo);
    lines.push(
      prefix +
        theme.fg(titleColor, todo.title || "(untitled)") +
        theme.fg("muted", tagText) +
        assignmentText +
        theme.fg("muted", progress) +
        " " +
        theme.fg(statusColor, `(${derived || "open"})`),
    );
  }
  while (lines.length < LIST_ROWS) lines.push(" ");
  for (const line of lines) listContainer.addChild(new Text(line, 0, 0));
  const pointer = totalItems ? safeIndex + 1 : 0;
  listContainer.addChild(new Text(theme.fg("dim", `  (${pointer}/${totalItems})`), 0, 0));
}

export function renderAll(
  tui: TUI,
  headerText: Text,
  hintText: Text,
  listContainer: { clear: () => void; addChild: (node: Text) => void },
  theme: Theme,
  todos: TodoFrontMatter[],
  selectedIndex: number,
  mode: TodoListMode,
  currentSessionId?: string,
  leaderActive = false,
): void {
  headerText.setText(buildHeader(theme, todos, mode));
  hintText.setText(buildHints(theme, mode, leaderActive));
  renderList(listContainer, theme, todos, selectedIndex, mode, currentSessionId);
  tui.requestRender();
}
