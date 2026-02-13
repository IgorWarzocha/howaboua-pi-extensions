import { Key, getEditorKeybindings, matchesKey } from "@mariozechner/pi-tui";

export type SelectorIntent =
    | "up"
    | "down"
    | "confirm"
    | "cancel"
    | "tab"
    | "create"
    | "sweep-abandoned"
    | "sweep-completed"
    | "refine"
    | "work"
    | "input";

export function mapIntent(keyData: string, mode: "open" | "closed"): SelectorIntent {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, "selectUp")) return "up";
    if (kb.matches(keyData, "selectDown")) return "down";
    if (kb.matches(keyData, "selectConfirm")) return "confirm";
    if (kb.matches(keyData, "selectCancel")) return "cancel";
    if (matchesKey(keyData, Key.tab)) return "tab";
    if (matchesKey(keyData, Key.ctrlAlt("c"))) return "create";
    if (mode === "closed" && matchesKey(keyData, Key.ctrlAlt("a"))) return "sweep-abandoned";
    if (mode === "closed" && matchesKey(keyData, Key.ctrlAlt("d"))) return "sweep-completed";
    if (matchesKey(keyData, Key.ctrlAlt("r"))) return "refine";
    if (matchesKey(keyData, Key.ctrlAlt("w"))) return "work";
    return "input";
}
