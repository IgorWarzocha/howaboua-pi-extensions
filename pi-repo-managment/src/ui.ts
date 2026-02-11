import type { Ui } from "./types.js";

export function pick(options: string[], title: string, ui: Ui): Promise<string | undefined> {
  if (options.length === 0) {
    throw new Error("Picker MUST receive at least one option.");
  }
  return ui.select(title, options, { timeout: 0 });
}

