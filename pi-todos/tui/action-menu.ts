import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { TodoRecord, TodoMenuAction } from "../types.js";
import { isTodoClosed } from "../format.js";

export class TodoActionMenuComponent extends Container {
  private selectList: SelectList;
  private onSelectCallback: (action: TodoMenuAction) => void;
  private onCancelCallback: () => void;

  constructor(
    theme: Theme,
    todo: TodoRecord,
    onSelect: (action: TodoMenuAction) => void,
    onCancel: () => void,
  ) {
    super();
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    const closed = isTodoClosed(todo.status);
    const title = todo.title || "(untitled)";
    const options: SelectItem[] = [
      { value: "work", label: "work", description: "Work on todo" },
      ...(closed
        ? [
            { value: "reopen", label: "reopen", description: "Reopen todo" },
            { value: "delete", label: "delete", description: "Delete todo" },
          ]
        : [
            { value: "refine", label: "refine", description: "Refine todo scope" },
            { value: "complete", label: "complete", description: "Mark todo as completed" },
            { value: "abandon", label: "abandon", description: "Mark todo as abandoned" },
          ]),
      ...(todo.assigned_to_session
        ? [{ value: "release", label: "release", description: "Release assignment" }]
        : []),
      { value: "view", label: "view", description: "View details" },
    ];

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Text(theme.fg("accent", theme.bold(`Actions for "${title}"`))));

    this.selectList = new SelectList(options, options.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    this.selectList.onSelect = (item) => this.onSelectCallback(item.value as TodoMenuAction);
    this.selectList.onCancel = () => this.onCancelCallback();

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
