import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoRecord, TodoMenuAction } from "../types.js";
import { isTodoClosed } from "../format.js";
import { noun } from "../gui/kind.js";

export class TodoActionMenuComponent extends Container {
  private selectList: SelectList;
  private onSelectCallback: (action: TodoMenuAction) => void;
  private onCancelCallback: () => void;
  private theme: Theme;
  private footerText: Text;

  constructor(
    theme: Theme,
    todo: TodoRecord,
    onSelect: (action: TodoMenuAction) => void,
    onCancel: () => void,
    opts?: { showView?: boolean; footer?: string },
  ) {
    super();
    this.theme = theme;
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    const closed = isTodoClosed(todo.status);
    const title = todo.title || "(untitled)";
    const item = noun(todo);
    const items: SelectItem[] = [
      { value: "work", label: "work", description: `Work on ${item}` },
      { value: "review-item", label: "review-item", description: "Review selected item" },
      ...(closed
        ? [
            { value: "reopen", label: "reopen", description: `Reopen ${item}` },
            { value: "delete", label: "delete", description: `Delete ${item}` },
          ]
        : [
            { value: "refine", label: "refine", description: `Refine ${item} scope` },
            { value: "complete", label: "complete", description: `Mark ${item} as completed` },
            { value: "abandon", label: "abandon", description: `Mark ${item} as abandoned` },
          ]),
      ...(todo.assigned_to_session
        ? [{ value: "release", label: "release", description: "Release assignment" }]
        : []),
      ...(opts?.showView === false
        ? []
        : [{ value: "view", label: "view", description: "View details" }]),
    ];

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Text(theme.fg("accent", theme.bold(`Actions for "${title}"`))));

    this.selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    this.selectList.onSelect = (item) => this.onSelectCallback(item.value as TodoMenuAction);
    this.selectList.onCancel = () => this.onCancelCallback();

    this.addChild(this.selectList);
    this.footerText = new Text(theme.fg("dim", opts?.footer ?? "Enter to confirm • Esc back"));
    this.addChild(this.footerText);
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    this.selectList.handleInput(keyData);
  }

  setFooter(value: string, tone: "dim" | "warning" = "dim"): void {
    this.footerText.setText(this.theme.fg(tone, value));
  }

  override invalidate(): void {
    super.invalidate();
  }
}
