import type { SelectItem, TUI } from "@mariozechner/pi-tui";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

export class WorktreeSelectComponent extends Container {
  private selectedIndex = 0;
  private items: SelectItem[];
  private onSelect: (value: string) => void;
  private onCancel: () => void;
  private theme: Theme;
  private tui: TUI;

  constructor(
    tui: TUI,
    theme: Theme,
    items: SelectItem[],
    onSelect: (value: string) => void,
    onCancel: () => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.items = items;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this.rebuild();
  }

  private rebuild() {
    this.children = [];
    this.addChild(new DynamicBorder((s: string) => this.theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(new Text(this.theme.fg("accent", " Worktree Orchestration"), 1, 0));
    this.addChild(new Spacer(1));
    this.items.forEach((item, i) => {
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.theme.fg("accent", "> ") : "  ";
      const label = isSelected ? this.theme.fg("accent", item.label) : item.label;
      const desc = item.description ? this.theme.fg("dim", ` - ${item.description}`) : "";
      this.addChild(new Text(`${prefix}${label}${desc}`, 1, 0));
    });
    this.addChild(new Spacer(1));
    this.addChild(new Text(this.theme.fg("warning", " [↑/↓] select • [enter] confirm • [esc] cancel"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => this.theme.fg("accent", s)));
  }

  handleInput(data: string) {
    if (data === "\u001b[A") { // Up
      this.selectedIndex = this.selectedIndex === 0 ? this.items.length - 1 : this.selectedIndex - 1;
      this.rebuild();
      this.tui.requestRender();
    } else if (data === "\u001b[B") { // Down
      this.selectedIndex = this.selectedIndex === this.items.length - 1 ? 0 : this.selectedIndex + 1;
      this.rebuild();
      this.tui.requestRender();
    } else if (data === "\r") {
      this.onSelect(this.items[this.selectedIndex].value);
    } else if (data === "\u001b") {
      this.onCancel();
    }
  }

  render(width: number): string[] {
    return super.render(width);
  }
}
