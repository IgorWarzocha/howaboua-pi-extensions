import {
    Container,
    type Focusable,
    Input,
    Key,
    Spacer,
    Text,
    TUI,
    getEditorKeybindings,
    matchesKey,
    truncateToWidth,
} from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoQuickAction } from "../types.js";
import { filterTodos } from "../filter.js";
import { formatTodoId, isTodoClosed, renderAssignmentSuffix } from "../format.js";

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

        this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        this.addChild(new Spacer(1));

        this.headerText = new Text("", 1, 0);
        this.addChild(this.headerText);
        this.addChild(new Spacer(1));

        this.searchInput = new Input();
        if (initialSearchInput) {
            this.searchInput.setValue(initialSearchInput);
        }
        this.searchInput.onSubmit = () => {
            const selected = this.getSelectedItem();
            if (selected) {
                if (selected.id === CREATE_ITEM_ID) {
                    this.onQuickAction?.(null, "create");
                } else {
                    this.onSelectCallback(selected);
                }
            }
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

        this.updateHeader();
        this.updateHints();
        this.applyFilter(this.searchInput.getValue());
    }

    setTodos(todos: TodoFrontMatter[]): void {
        this.allTodos = todos;
        this.updateHeader();
        this.applyFilter(this.searchInput.getValue());
        this.tui.requestRender();
    }

    getSearchValue(): string {
        return this.searchInput.getValue();
    }

    private getSelectedItem(): TodoFrontMatter | null {
        if (this.selectedIndex === 0) {
            return { id: CREATE_ITEM_ID, title: "", tags: [], status: "", created_at: "" };
        }
        return this.filteredTodos[this.selectedIndex - 1] ?? null;
    }

    private updateHeader(): void {
        const openCount = this.allTodos.filter((todo) => !isTodoClosed(todo.status)).length;
        const closedCount = this.allTodos.length - openCount;
        const title = `Todos (${openCount} open, ${closedCount} closed)`;
        this.headerText.setText(this.theme.fg("accent", this.theme.bold(title)));
    }

    private updateHints(): void {
        this.hintText.setText(
            this.theme.fg(
                "dim",
                "Type to search • ↑↓ select • Enter actions • Ctrl+Shift+C create • Ctrl+Shift+W work • Ctrl+Shift+R refine • Esc close",
            ),
        );
    }

    private applyFilter(query: string): void {
        this.filteredTodos = filterTodos(this.allTodos, query);
        this.selectedIndex = Math.min(this.selectedIndex, this.filteredTodos.length);
        this.updateList();
    }

    private updateList(): void {
        this.listContainer.clear();

        const totalItems = this.filteredTodos.length + 1;
        const maxVisible = 10;
        const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), totalItems - maxVisible));
        const endIndex = Math.min(startIndex + maxVisible, totalItems);

        for (let i = startIndex; i < endIndex; i += 1) {
            if (i === 0) {
                this.renderCreateItem(i === this.selectedIndex);
                continue;
            }

            const todoIndex = i - 1;
            const todo = this.filteredTodos[todoIndex];
            if (!todo) continue;

            const isSelected = i === this.selectedIndex;
            const closed = isTodoClosed(todo.status);
            const prefix = isSelected ? this.theme.fg("accent", "→ ") : "  ";
            const titleColor = isSelected ? "accent" : closed ? "dim" : "text";
            const statusColor = closed ? "dim" : "success";
            const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
            const assignmentText = renderAssignmentSuffix(this.theme, todo, this.currentSessionId);
            const line =
                prefix +
                this.theme.fg("accent", formatTodoId(todo.id)) +
                " " +
                this.theme.fg(titleColor, todo.title || "(untitled)") +
                this.theme.fg("muted", tagText) +
                assignmentText +
                " " +
                this.theme.fg(statusColor, `(${todo.status || "open"})`);
            this.listContainer.addChild(new Text(line, 0, 0));
        }

        if (startIndex > 0 || endIndex < totalItems) {
            const scrollInfo = this.theme.fg("dim", `  (${this.selectedIndex + 1}/${totalItems})`);
            this.listContainer.addChild(new Text(scrollInfo, 0, 0));
        }
    }

    private renderCreateItem(isSelected: boolean): void {
        const prefix = isSelected ? this.theme.fg("success", "→ ") : "  ";
        const plusSign = this.theme.fg("success", "+");
        const text = isSelected ? this.theme.fg("accent", " Create new todo...") : this.theme.fg("dim", " Create new todo...");
        this.listContainer.addChild(new Text(prefix + plusSign + text, 0, 0));
    }

    handleInput(keyData: string): void {
        const kb = getEditorKeybindings();
        const totalItems = this.filteredTodos.length + 1;

        if (kb.matches(keyData, "selectUp")) {
            this.selectedIndex = this.selectedIndex === 0 ? totalItems - 1 : this.selectedIndex - 1;
            this.updateList();
            return;
        }
        if (kb.matches(keyData, "selectDown")) {
            this.selectedIndex = this.selectedIndex === totalItems - 1 ? 0 : this.selectedIndex + 1;
            this.updateList();
            return;
        }
        if (kb.matches(keyData, "selectConfirm")) {
            const selected = this.getSelectedItem();
            if (selected) {
                if (selected.id === CREATE_ITEM_ID) {
                    this.onQuickAction?.(null, "create");
                } else {
                    this.onSelectCallback(selected);
                }
            }
            return;
        }
        if (kb.matches(keyData, "selectCancel")) {
            this.onCancelCallback();
            return;
        }
        if (matchesKey(keyData, Key.ctrlShift("c"))) {
            this.onQuickAction?.(null, "create");
            return;
        }
        if (matchesKey(keyData, Key.ctrlShift("r"))) {
            if (this.selectedIndex > 0) {
                const selected = this.filteredTodos[this.selectedIndex - 1];
                if (selected) this.onQuickAction?.(selected, "refine");
            }
            return;
        }
        if (matchesKey(keyData, Key.ctrlShift("w"))) {
            if (this.selectedIndex > 0) {
                const selected = this.filteredTodos[this.selectedIndex - 1];
                if (selected) this.onQuickAction?.(selected, "work");
            }
            return;
        }
        this.searchInput.handleInput(keyData);
        this.applyFilter(this.searchInput.getValue());
    }

    override invalidate(): void {
        super.invalidate();
        this.updateHeader();
        this.updateHints();
        this.updateList();
    }
}
