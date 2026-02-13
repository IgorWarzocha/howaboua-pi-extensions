import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

export class TodoDeleteConfirmComponent extends Container {
  private selectList: SelectList;
  private onConfirm: (confirmed: boolean) => void;

  constructor(theme: Theme, message: string, onConfirm: (confirmed: boolean) => void) {
    super();
    this.onConfirm = onConfirm;

    const options: SelectItem[] = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Text(theme.fg("accent", message)));

    this.selectList = new SelectList(options, options.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    this.selectList.onSelect = (item) => this.onConfirm(item.value === "yes");
    this.selectList.onCancel = () => this.onConfirm(false);

    this.addChild(this.selectList);
    this.addChild(new Text(theme.fg("dim", "Enter to confirm • Esc back")));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    this.selectList.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}
