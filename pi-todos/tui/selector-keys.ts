import { Key, getEditorKeybindings, matchesKey } from "@mariozechner/pi-tui";
import type { TodoListMode } from "../types.js";

export type SelectorIntent = "up" | "down" | "confirm" | "cancel" | "tab" | "leader" | "input";

export function mapIntent(keyData: string, mode: TodoListMode): SelectorIntent {
  const kb = getEditorKeybindings();
  if (!mode) return "input";
  if (kb.matches(keyData, "selectUp")) return "up";
  if (kb.matches(keyData, "selectDown")) return "down";
  if (kb.matches(keyData, "selectConfirm")) return "confirm";
  if (kb.matches(keyData, "selectCancel")) return "cancel";
  if (matchesKey(keyData, Key.tab)) return "tab";
  if (keyData === "k" || keyData === "K") return "up";
  if (keyData === "j" || keyData === "J") return "down";
  if (matchesKey(keyData, Key.ctrl("x"))) return "leader";
  return "input";
}
