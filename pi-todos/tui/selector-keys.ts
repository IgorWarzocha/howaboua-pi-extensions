import { Key, getEditorKeybindings, matchesKey } from "@mariozechner/pi-tui";
import type { TodoListMode } from "../types.js";

export type SelectorIntent =
  | "up"
  | "down"
  | "confirm"
  | "cancel"
  | "tab"
  | "tab-back"
  | "leader"
  | "input";

export function mapIntent(keyData: string, mode: TodoListMode): SelectorIntent {
  const kb = getEditorKeybindings();
  if (!mode) return "input";
  if (kb.matches(keyData, "selectUp")) return "up";
  if (kb.matches(keyData, "selectDown")) return "down";
  if (kb.matches(keyData, "selectConfirm")) return "confirm";
  if (kb.matches(keyData, "selectCancel")) return "cancel";
  if (matchesKey(keyData, Key.shift("tab"))) return "tab-back";
  if (keyData === "\u001b[Z" || keyData === "\u001b[1;2Z" || keyData === "\u001b\t")
    return "tab-back";
  if (keyData.includes("[Z")) return "tab-back";
  if (matchesKey(keyData, Key.tab)) return "tab";
  if (keyData === "k" || keyData === "K") return "up";
  if (keyData === "j" || keyData === "J") return "down";
  if (matchesKey(keyData, Key.ctrl("x"))) return "leader";
  return "input";
}
