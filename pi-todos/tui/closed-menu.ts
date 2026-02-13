import { Container, Text, getEditorKeybindings } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoRecord } from "../types.js";
import { formatTodoId } from "../format.js";

export type TodoClosedAction =
  | { type: "delete-selected"; ids: string[] }
  | { type: "reopen-selected"; ids: string[] }
  | { type: "delete-abandoned" }
  | { type: "delete-completed" }
  | { type: "back" };

export class TodoClosedMenuComponent extends Container {
  private todos: TodoRecord[];
  private selectedIndex = 0;
  private selectedIds = new Set<string>();
  private list = new Container();
  private onSelect: (action: TodoClosedAction) => void;
  private theme: Theme;

  constructor(theme: Theme, todos: TodoRecord[], onSelect: (action: TodoClosedAction) => void) {
    super();
    this.theme = theme;
    this.onSelect = onSelect;
    this.todos = todos;
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Text(theme.fg("accent", theme.bold("Closed todo management"))));
    this.addChild(this.list);
    this.addChild(
      new Text(
        theme.fg(
          "dim",
          "↑↓ move • space select • enter delete selected • r reopen selected • a delete abandoned • c delete completed • esc back",
        ),
      ),
    );
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.refresh();
  }

  private refresh(): void {
    this.list.clear();
    if (!this.todos.length) {
      this.list.addChild(new Text(this.theme.fg("dim", "No closed todos.")));
      return;
    }
    for (let i = 0; i < this.todos.length; i += 1) {
      const todo = this.todos[i];
      const focus = i === this.selectedIndex ? this.theme.fg("accent", "→ ") : "  ";
      const marked = this.selectedIds.has(todo.id) ? "[x]" : "[ ]";
      const status = todo.status.toLowerCase();
      const statusText =
        status === "abandoned" ? this.theme.fg("error", "abandoned") : this.theme.fg("dim", "done");
      this.list.addChild(
        new Text(
          `${focus}${marked} ${this.theme.fg("accent", formatTodoId(todo.id))} ${todo.title} ${statusText}`,
        ),
      );
    }
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, "selectCancel")) {
      this.onSelect({ type: "back" });
      return;
    }
    if (!this.todos.length) return;
    if (kb.matches(keyData, "selectUp")) {
      this.selectedIndex =
        this.selectedIndex === 0 ? this.todos.length - 1 : this.selectedIndex - 1;
      this.refresh();
      return;
    }
    if (kb.matches(keyData, "selectDown")) {
      this.selectedIndex =
        this.selectedIndex === this.todos.length - 1 ? 0 : this.selectedIndex + 1;
      this.refresh();
      return;
    }
    if (keyData === " ") {
      const id = this.todos[this.selectedIndex].id;
      if (this.selectedIds.has(id)) this.selectedIds.delete(id);
      else this.selectedIds.add(id);
      this.refresh();
      return;
    }
    if (kb.matches(keyData, "selectConfirm")) {
      const ids = [...this.selectedIds];
      if (!ids.length) return;
      this.onSelect({ type: "delete-selected", ids });
      return;
    }
    if (keyData === "r") {
      const ids = [...this.selectedIds];
      if (!ids.length) return;
      this.onSelect({ type: "reopen-selected", ids });
      return;
    }
    if (keyData === "a") {
      this.onSelect({ type: "delete-abandoned" });
      return;
    }
    if (keyData === "c") {
      this.onSelect({ type: "delete-completed" });
      return;
    }
  }
}
