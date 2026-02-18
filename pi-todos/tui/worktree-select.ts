import { Container, Spacer, Text, type TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { mapIntent } from "./selector-keys.js";

const ROWS = 9;

export interface WorktreeItem {
  value: string;
  label: string;
  description?: string;
}

export class WorktreeSelectComponent extends Container {
  private selectedIndex = 0;
  private items: WorktreeItem[];
  private onSelectCallback: (value: string) => void;
  private onCancelCallback: () => void;
  private theme: Theme;
  private tui: TUI;
  private listContainer: Container;

  constructor(
    tui: TUI,
    theme: Theme,
    items: WorktreeItem[],
    onSelect: (value: string) => void,
    onCancel: () => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.items = items;
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold("Worktree Orchestration")), 1, 0));
    this.addChild(new Spacer(1));
    
    this.listContainer = new Container();
    this.addChild(this.listContainer);
    
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "↑↓ select • Enter confirm • Esc back"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    
    this.renderState();
  }

  private renderState(): void {
    this.listContainer.clear();
    const start = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(ROWS / 2),
        Math.max(0, this.items.length - ROWS),
      ),
    );
    const end = Math.min(start + ROWS, this.items.length);
    for (let index = start; index < end; index += 1) {
      const item = this.items[index];
      const isSelected = index === this.selectedIndex;
      const prefix = isSelected ? this.theme.fg("accent", "→ ") : "  ";
      const label = isSelected ? this.theme.fg("accent", item.label) : item.label;
      const desc = item.description ? this.theme.fg("muted", ` (${item.description})`) : "";
      this.listContainer.addChild(new Text(prefix + label + desc, 1, 0));
    }
    for (let index = end - start; index < ROWS; index += 1) {
      this.listContainer.addChild(new Text("⠀", 1, 0));
    }
    const pointer = this.items.length ? this.selectedIndex + 1 : 0;
    this.listContainer.addChild(
      new Text(this.theme.fg("dim", `  (${pointer}/${this.items.length})`), 1, 0),
    );
    this.tui.requestRender();
  }

  handleInput(keyData: string): void {
    const intent = mapIntent(keyData, "tasks"); // Use "tasks" mode for standard selector mapping
    
    if (intent === "up") {
      this.selectedIndex = this.selectedIndex === 0 ? this.items.length - 1 : this.selectedIndex - 1;
      this.renderState();
    } else if (intent === "down") {
      this.selectedIndex = this.selectedIndex === this.items.length - 1 ? 0 : this.selectedIndex + 1;
      this.renderState();
    } else if (intent === "confirm") {
      this.onSelectCallback(this.items[this.selectedIndex].value);
    } else if (intent === "cancel") {
      this.onCancelCallback();
    }
  }

  override invalidate(): void {
    super.invalidate();
    this.renderState();
  }
}
