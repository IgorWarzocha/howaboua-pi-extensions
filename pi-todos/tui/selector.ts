import { Container, type Focusable, Input, Spacer, Text, TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoQuickAction } from "../types.js";
import { filterTodos } from "../filter.js";
import { mapIntent } from "./selector-keys.js";
import { renderAll } from "./selector-view.js";

const CREATE_ITEM_ID = "__CREATE__";

export class TodoSelectorComponent extends Container implements Focusable {
  private searchInput: Input;
  private listContainer: Container;
  private allTodos: TodoFrontMatter[];
  private filteredTodos: TodoFrontMatter[];
  private selectedIndex = 0;
  private onSelectCallback: (todo: TodoFrontMatter) => void;
  private onCancelCallback: () => void;
  private tui: TUI;
  private theme: Theme;
  private headerText: Text;
  private hintText: Text;
  private currentSessionId?: string;
  private onQuickAction?: (todo: TodoFrontMatter | null, action: TodoQuickAction) => void;
  private onTabCallback?: () => void;
  private onCommandCallback?: (action: "sweep-abandoned" | "sweep-completed") => void;
  private mode: "open" | "closed";
  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor(
    tui: TUI,
    theme: Theme,
    todos: TodoFrontMatter[],
    onSelect: (todo: TodoFrontMatter) => void,
    onCancel: () => void,
    initialSearchInput?: string,
    currentSessionId?: string,
    onQuickAction?: (todo: TodoFrontMatter | null, action: TodoQuickAction) => void,
    onTab?: () => void,
    onCommand?: (action: "sweep-abandoned" | "sweep-completed") => void,
    mode: "open" | "closed" = "open",
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.currentSessionId = currentSessionId;
    this.allTodos = todos;
    this.filteredTodos = todos;
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;
    this.onQuickAction = onQuickAction;
    this.onTabCallback = onTab;
    this.onCommandCallback = onCommand;
    this.mode = mode;
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.headerText = new Text("", 1, 0);
    this.addChild(this.headerText);
    this.addChild(new Spacer(1));
    this.searchInput = new Input();
    if (initialSearchInput) this.searchInput.setValue(initialSearchInput);
    this.searchInput.onSubmit = () => this.confirmSelection();
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.listContainer = new Container();
    this.addChild(this.listContainer);
    this.addChild(new Spacer(1));
    this.hintText = new Text("", 1, 0);
    this.addChild(this.hintText);
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.renderState();
  }

  setTodos(todos: TodoFrontMatter[]): void {
    this.allTodos = todos;
    this.applyFilter(this.searchInput.getValue());
  }

  getSearchValue(): string {
    return this.searchInput.getValue();
  }

  private getSelectedItem(): TodoFrontMatter | null {
    if (this.selectedIndex === 0)
      return { id: CREATE_ITEM_ID, title: "", tags: [], status: "", created_at: "" };
    return this.filteredTodos[this.selectedIndex - 1] ?? null;
  }

  private confirmSelection(): void {
    const selected = this.getSelectedItem();
    if (!selected) return;
    if (selected.id === CREATE_ITEM_ID) {
      this.onQuickAction?.(null, "create");
      return;
    }
    this.onSelectCallback(selected);
  }

  private applyFilter(query: string): void {
    this.filteredTodos = filterTodos(this.allTodos, query);
    this.selectedIndex = Math.min(this.selectedIndex, this.filteredTodos.length);
    this.renderState();
  }

  private renderState(): void {
    renderAll(
      this.tui,
      this.headerText,
      this.hintText,
      this.listContainer,
      this.theme,
      this.filteredTodos,
      this.selectedIndex,
      this.mode,
      this.currentSessionId,
    );
  }

  handleInput(keyData: string): void {
    const totalItems = this.filteredTodos.length + 1;
    const intent = mapIntent(keyData, this.mode);
    if (intent === "up") {
      this.selectedIndex = this.selectedIndex === 0 ? totalItems - 1 : this.selectedIndex - 1;
      this.renderState();
      return;
    }
    if (intent === "down") {
      this.selectedIndex = this.selectedIndex === totalItems - 1 ? 0 : this.selectedIndex + 1;
      this.renderState();
      return;
    }
    if (intent === "confirm") return this.confirmSelection();
    if (intent === "cancel") return this.onCancelCallback();
    if (intent === "tab") return this.onTabCallback?.();
    if (intent === "create") return this.onQuickAction?.(null, "create");
    if (intent === "sweep-abandoned") return this.onCommandCallback?.("sweep-abandoned");
    if (intent === "sweep-completed") return this.onCommandCallback?.("sweep-completed");
    if (intent === "refine") {
      const selected = this.filteredTodos[this.selectedIndex - 1];
      if (selected) this.onQuickAction?.(selected, "refine");
      return;
    }
    if (intent === "work") {
      const selected = this.filteredTodos[this.selectedIndex - 1];
      if (selected) this.onQuickAction?.(selected, "work");
      return;
    }
    this.searchInput.handleInput(keyData);
    this.applyFilter(this.searchInput.getValue());
  }

  override invalidate(): void {
    super.invalidate();
    this.renderState();
  }
}
