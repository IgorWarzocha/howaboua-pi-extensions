import { Container, Spacer, Text, TUI, getEditorKeybindings } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

interface Row {
  key: string;
  label: string;
  kind: "prd" | "spec" | "todo";
  reason: string;
}

interface State {
  prds: Set<string>;
  specs: Set<string>;
  todos: Set<string>;
}

function section(rows: Row[], kind: "prd" | "spec" | "todo"): Row[] {
  return rows.filter((item) => item.kind === kind);
}

export class ValidateSelectComponent extends Container {
  private tui: TUI;
  private theme: Theme;
  private rows: Row[];
  private active = 0;
  private selected = new Set<string>();
  private onSubmit: (state: State) => void;
  private onCancel: () => void;
  private view: Container;

  constructor(tui: TUI, theme: Theme, rows: Row[], onSubmit: (state: State) => void, onCancel: () => void) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.rows = rows;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.view = new Container();
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold("Recommended attachments")), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.view);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Order: PRDs -> Specs -> Todos • ↑↓ move • Space toggle • Enter apply • Esc back"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.renderState();
  }

  private list(): Row[] {
    const prds = section(this.rows, "prd");
    const specs = section(this.rows, "spec");
    const todos = section(this.rows, "todo");
    return [...prds, ...specs, ...todos];
  }

  private renderState(): void {
    this.view.clear();
    const rows = this.list();
    const prds = section(rows, "prd");
    const specs = section(rows, "spec");
    const todos = section(rows, "todo");
    this.drawGroup("PRDs", prds, rows);
    this.drawGroup("Specs", specs, rows);
    this.drawGroup("Todos", todos, rows);
    this.tui.requestRender();
  }

  private drawGroup(name: string, rows: Row[], all: Row[]): void {
    this.view.addChild(new Text(this.theme.fg("muted", name), 0, 0));
    if (!rows.length) {
      this.view.addChild(new Text(this.theme.fg("dim", "  (none)"), 0, 0));
      this.view.addChild(new Spacer(1));
      return;
    }
    for (const row of rows) {
      const index = all.findIndex((item) => item.key === row.key);
      const mark = this.selected.has(row.key) ? "[x]" : "[ ]";
      const pointer = this.active === index ? this.theme.fg("accent", "→ ") : "  ";
      this.view.addChild(new Text(`${pointer}${mark} ${row.label}`, 0, 0));
      this.view.addChild(new Text(this.theme.fg("dim", `    ${row.reason}`), 0, 0));
    }
    this.view.addChild(new Spacer(1));
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    const rows = this.list();
    if (!rows.length) {
      if (data === "\u001b" || kb.matches(data, "selectCancel")) this.onCancel();
      return;
    }
    if (data === "\u001b" || kb.matches(data, "selectCancel") || data === "\u0003") return this.onCancel();
    if (data === "\u001b[A" || kb.matches(data, "selectUp") || data === "k") {
      this.active = this.active === 0 ? rows.length - 1 : this.active - 1;
      return this.renderState();
    }
    if (data === "\u001b[B" || kb.matches(data, "selectDown") || data === "j") {
      this.active = this.active === rows.length - 1 ? 0 : this.active + 1;
      return this.renderState();
    }
    if (data === " ") {
      const row = rows[this.active];
      if (!row) return;
      if (this.selected.has(row.key)) this.selected.delete(row.key);
      else this.selected.add(row.key);
      return this.renderState();
    }
    if (kb.matches(data, "selectConfirm") || data === "\r") {
      const state: State = { prds: new Set<string>(), specs: new Set<string>(), todos: new Set<string>() };
      for (const row of rows) {
        if (!this.selected.has(row.key)) continue;
        if (row.kind === "prd") state.prds.add(row.key);
        if (row.kind === "spec") state.specs.add(row.key);
        if (row.kind === "todo") state.todos.add(row.key);
      }
      return this.onSubmit(state);
    }
  }
}

