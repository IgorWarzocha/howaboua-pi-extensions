import {
  Container,
  type Focusable,
  Input,
  Spacer,
  Text,
  TUI,
  getEditorKeybindings,
} from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoListMode, TodoQuickAction } from "../types.js";
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
  private mode: TodoListMode;
  private leaderActive = false;
  private leaderTimer: ReturnType<typeof setTimeout> | null = null;
  private searchActive = false;
  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value && this.searchActive;
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
    mode: TodoListMode = "tasks",
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
    this.searchInput.onSubmit = () => {
      this.searchActive = false;
      this.searchInput.focused = false;
      this.renderState();
    };
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
  private getSelectedItem(): TodoFrontMatter | null {
    if (this.mode !== "closed" && this.selectedIndex === 0)
      return { id: CREATE_ITEM_ID, title: "", tags: [], status: "", created_at: "" };
    const offset = this.mode === "closed" ? 0 : 1;
    return this.filteredTodos[this.selectedIndex - offset] ?? null;
  }

  private clearLeader(): void {
    if (this.leaderTimer) clearTimeout(this.leaderTimer);
    this.leaderTimer = null;
    this.leaderActive = false;
    this.renderState();
  }

  private startLeader(): void {
    if (this.leaderActive) return this.clearLeader();
    this.leaderActive = true;
    if (this.leaderTimer) clearTimeout(this.leaderTimer);
    this.leaderTimer = setTimeout(() => this.clearLeader(), 2000);
    this.renderState();
  }

  private startSearch(): void {
    this.searchActive = true;
    this.searchInput.focused = this._focused;
    this.renderState();
  }

  private runLeader(keyData: string): boolean {
    const selected = this.getSelectedItem();
    if (keyData === "x" || keyData === "X") return (this.clearLeader(), true);
    if (keyData === "c" || keyData === "C")
      return (this.onQuickAction?.(null, "create"), this.clearLeader(), true);
    if ((keyData === "w" || keyData === "W") && selected)
      return (this.onQuickAction?.(selected, "work"), this.clearLeader(), true);
    if ((keyData === "r" || keyData === "R") && selected)
      return (this.onQuickAction?.(selected, "refine"), this.clearLeader(), true);
    if ((keyData === "v" || keyData === "V") && selected)
      return (this.onSelectCallback(selected), this.clearLeader(), true);
    if ((keyData === "a" || keyData === "A") && this.mode === "closed")
      return (this.onCommandCallback?.("sweep-abandoned"), this.clearLeader(), true);
    if ((keyData === "d" || keyData === "D") && this.mode === "closed")
      return (this.onCommandCallback?.("sweep-completed"), this.clearLeader(), true);
    this.clearLeader();
    return false;
  }

  private confirmSelection(): void {
    const selected = this.getSelectedItem();
    if (!selected) return;
    if (selected.id === CREATE_ITEM_ID) return this.onQuickAction?.(null, "create");
    this.onSelectCallback(selected);
  }

  private applyFilter(query: string): void {
    this.filteredTodos = filterTodos(this.allTodos, query);
    const max = Math.max(0, this.filteredTodos.length - (this.mode === "closed" ? 1 : 0));
    this.selectedIndex = Math.min(this.selectedIndex, max);
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
      this.leaderActive,
    );
  }

  handleInput(keyData: string): void {
    if (!this.searchActive && keyData === "/") return this.startSearch();
    if (this.searchActive) {
      const kb = getEditorKeybindings();
      if (kb.matches(keyData, "selectConfirm")) {
        this.searchActive = false;
        this.searchInput.focused = false;
        this.renderState();
        return;
      }
      if (kb.matches(keyData, "selectCancel")) {
        this.searchActive = false;
        this.searchInput.focused = false;
        this.searchInput.setValue("");
        this.applyFilter("");
        return;
      }
      if (kb.matches(keyData, "selectUp") || kb.matches(keyData, "selectDown")) return;
      this.searchInput.handleInput(keyData);
      this.applyFilter(this.searchInput.getValue());
      return;
    }
    const totalItems = this.filteredTodos.length + (this.mode === "closed" ? 0 : 1);
    const intent = mapIntent(keyData, this.mode);
    if (this.leaderActive) {
      if (intent === "leader") return this.clearLeader();
      if (this.runLeader(keyData)) return;
    }
    if (intent === "leader") return this.startLeader();
    if (intent === "up") {
      this.selectedIndex = this.selectedIndex === 0 ? totalItems - 1 : this.selectedIndex - 1;
      return this.renderState();
    }
    if (intent === "down") {
      this.selectedIndex = this.selectedIndex === totalItems - 1 ? 0 : this.selectedIndex + 1;
      return this.renderState();
    }
    if (intent === "confirm") return this.confirmSelection();
    if (intent === "cancel") return this.onCancelCallback();
    if (intent === "tab") return this.onTabCallback?.();
  }

  override invalidate(): void {
    super.invalidate();
    this.renderState();
  }
}
