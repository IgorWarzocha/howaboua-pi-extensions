import { Container, Input, Spacer, Text, TUI, getEditorKeybindings } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

export class TodoCreateInputComponent extends Container {
  private input: Input;
  private onSubmitCallback: (prompt: string) => void;
  private onCancelCallback: () => void;

  constructor(tui: TUI, theme: Theme, onSubmit: (prompt: string) => void, onCancel: () => void) {
    super();
    this.onSubmitCallback = onSubmit;
    this.onCancelCallback = onCancel;

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));

    this.addChild(new Text(theme.fg("accent", theme.bold("Create New Todo")), 1, 0));
    this.addChild(new Spacer(1));

    this.addChild(
      new Text(
        theme.fg(
          "muted",
          "Describe the task. The AI will read files and ask questions before creating.",
        ),
        1,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    this.input = new Input();
    this.input.onSubmit = () => {
      const value = this.input.getValue().trim();
      if (value) {
        this.onSubmitCallback(value);
      }
    };
    this.addChild(this.input);

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to submit • Esc back")));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, "selectCancel")) {
      this.onCancelCallback();
      return;
    }
    this.input.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}
