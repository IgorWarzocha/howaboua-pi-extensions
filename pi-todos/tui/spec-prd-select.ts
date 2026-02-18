import { Container, Spacer, Text, TUI, getEditorKeybindings } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter } from "../types.js";

const NONE = "__NONE__";

export class SpecPrdSelectComponent extends Container {
  private rows: Array<{ id: string; title: string }>;
  private selected = 0;
  private chosen = new Set<string>();
  private list: Container;
  private onSubmit: (items: TodoFrontMatter[]) => void;
  private onCancel: () => void;
  private prds: TodoFrontMatter[];
  private theme: Theme;
  private tui: TUI;

  constructor(tui: TUI, theme: Theme, prds: TodoFrontMatter[], onSubmit: (items: TodoFrontMatter[]) => void, onCancel: () => void) {
    super();
    this.tui = tui;
    this.prds = prds;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.theme = theme;
    this.rows = [{ id: NONE, title: "Create standalone spec" }, ...prds.map((item) => ({ id: item.id, title: item.title || "(untitled PRD)" }))];
    this.list = new Container();
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold("Attach PRDs to spec")), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("muted", "Top item creates standalone spec. Select PRDs with Space. Enter confirms."), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.list);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "↑↓ or j/k move • Space toggle • Enter confirm • Esc back"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.renderState();
  }

  private renderState(): void {
    this.list.clear();
    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index];
      const mark = this.chosen.has(row.id) ? "[x]" : "[ ]";
      const pointer = index === this.selected ? this.theme.fg("accent", "→ ") : "  ";
      const color = index === this.selected ? "accent" : "text";
      this.list.addChild(new Text(`${pointer}${mark} ${this.theme.fg(color, row.title)}`, 0, 0));
    }
    this.tui.requestRender();
  }

  private confirm(): void {
    if (this.chosen.has(NONE) || !this.chosen.size) return this.onSubmit([]);
    const ids = new Set(this.chosen);
    const items = this.prds.filter((item) => ids.has(item.id));
    this.onSubmit(items);
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    if (data === "\u001b[A") {
      this.selected = this.selected === 0 ? this.rows.length - 1 : this.selected - 1;
      return this.renderState();
    }
    if (data === "\u001b[B") {
      this.selected = this.selected === this.rows.length - 1 ? 0 : this.selected + 1;
      return this.renderState();
    }
    if (data === "\u001b" || kb.matches(data, "selectCancel") || data === "\u0003") return this.onCancel();
    if (kb.matches(data, "selectConfirm") || data === "\r") return this.confirm();
    if (kb.matches(data, "selectUp") || data === "k") {
      this.selected = this.selected === 0 ? this.rows.length - 1 : this.selected - 1;
      return this.renderState();
    }
    if (kb.matches(data, "selectDown") || data === "j") {
      this.selected = this.selected === this.rows.length - 1 ? 0 : this.selected + 1;
      return this.renderState();
    }
    if (data !== " ") return;
    const row = this.rows[this.selected];
    if (!row) return;
    if (row.id === NONE) {
      this.chosen.clear();
      this.chosen.add(NONE);
      return this.renderState();
    }
    this.chosen.delete(NONE);
    if (this.chosen.has(row.id)) this.chosen.delete(row.id);
    else this.chosen.add(row.id);
    this.renderState();
  }
}
