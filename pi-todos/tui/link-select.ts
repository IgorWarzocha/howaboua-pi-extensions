import { Container, Key, Spacer, Text, TUI, getEditorKeybindings, matchesKey } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter } from "../types.js";

const ROWS = 9;

interface LinkState {
  prds: Set<string>;
  specs: Set<string>;
  todos: Set<string>;
}

export class LinkSelectComponent extends Container {
  private tui: TUI;
  private theme: Theme;
  private onSubmit: (state: LinkState) => void;
  private onCancel: () => void;
  private prds: TodoFrontMatter[];
  private specs: TodoFrontMatter[];
  private todos: TodoFrontMatter[];
  private tab: "prds" | "specs" | "todos" = "prds";
  private selected = 0;
  private prdSet = new Set<string>();
  private specSet = new Set<string>();
  private todoSet = new Set<string>();
  private list: Container;

  constructor(
    tui: TUI,
    theme: Theme,
    prds: TodoFrontMatter[],
    specs: TodoFrontMatter[],
    todos: TodoFrontMatter[],
    onSubmit: (state: LinkState) => void,
    onCancel: () => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.prds = prds;
    this.specs = specs;
    this.todos = todos;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.list = new Container();
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold("Attach existing items")), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("muted", "Tab switches lists. Space toggles. Enter confirms."), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.list);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Tab switch lists • ↑↓ or j/k move • Space toggle • Enter confirm • Esc back"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.renderState();
  }

  private rows(): TodoFrontMatter[] {
    if (this.tab === "prds") return this.prds;
    if (this.tab === "specs") return this.specs;
    return this.todos;
  }

  private active(): Set<string> {
    if (this.tab === "prds") return this.prdSet;
    if (this.tab === "specs") return this.specSet;
    return this.todoSet;
  }

  private renderState(): void {
    this.list.clear();
    const tabs =
      this.theme.fg(this.tab === "prds" ? "accent" : "muted", "PRDs") +
      this.theme.fg("muted", " | ") +
      this.theme.fg(this.tab === "specs" ? "accent" : "muted", "Specs") +
      this.theme.fg("muted", " | ") +
      this.theme.fg(this.tab === "todos" ? "accent" : "muted", "Todos");
    this.list.addChild(new Text(tabs, 0, 0));
    this.list.addChild(new Spacer(1));
    const rows = this.rows();
    const active = this.active();
    const start = Math.max(
      0,
      Math.min(this.selected - Math.floor(ROWS / 2), Math.max(0, rows.length - ROWS)),
    );
    const end = Math.min(start + ROWS, rows.length);
    for (let index = start; index < end; index += 1) {
      const row = rows[index];
      const mark = active.has(row.id) ? "[x]" : "[ ]";
      const pointer = index === this.selected ? this.theme.fg("accent", "→ ") : "  ";
      const title = row.title || "(untitled)";
      this.list.addChild(new Text(`${pointer}${mark} ${title}`, 0, 0));
    }
    for (let index = end - start; index < ROWS; index += 1) {
      this.list.addChild(new Text("\u200b", 0, 0));
    }
    const pointer = rows.length ? this.selected + 1 : 0;
    this.list.addChild(new Text(this.theme.fg("dim", `  (${pointer}/${rows.length})`), 0, 0));
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    if (data === "\u001b[A") {
      const rows = this.rows();
      this.selected = this.selected === 0 ? Math.max(0, rows.length - 1) : this.selected - 1;
      return this.renderState();
    }
    if (data === "\u001b[B") {
      const rows = this.rows();
      this.selected = this.selected === Math.max(0, rows.length - 1) ? 0 : this.selected + 1;
      return this.renderState();
    }
    if (data === "\u001b" || kb.matches(data, "selectCancel") || data === "\u0003") return this.onCancel();
    if (matchesKey(data, Key.tab) || data === "\t" || data === "\u0009") {
      this.tab = this.tab === "prds" ? "specs" : this.tab === "specs" ? "todos" : "prds";
      this.selected = 0;
      return this.renderState();
    }
    if (kb.matches(data, "selectConfirm") || data === "\r") {
      return this.onSubmit({ prds: this.prdSet, specs: this.specSet, todos: this.todoSet });
    }
    if (kb.matches(data, "selectUp") || data === "k") {
      const rows = this.rows();
      this.selected = this.selected === 0 ? Math.max(0, rows.length - 1) : this.selected - 1;
      return this.renderState();
    }
    if (kb.matches(data, "selectDown") || data === "j") {
      const rows = this.rows();
      this.selected = this.selected === Math.max(0, rows.length - 1) ? 0 : this.selected + 1;
      return this.renderState();
    }
    if (data !== " ") return;
    const row = this.rows()[this.selected];
    if (!row) return;
    const active = this.active();
    if (active.has(row.id)) active.delete(row.id);
    else active.add(row.id);
    this.renderState();
  }
}

