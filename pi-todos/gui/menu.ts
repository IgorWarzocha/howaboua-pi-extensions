import type { SelectItem } from "@mariozechner/pi-tui";
import type { TodoRecord } from "../types.js";
import { prdItems } from "../prd/menu.js";
import { specItems } from "../spec/menu.js";
import { todoItems } from "../todo/menu.js";

export function items(todo: TodoRecord, closed: boolean, showView: boolean): SelectItem[] {
  const assigned = Boolean(todo.assigned_to_session);
  if (todo.kind === "prd") return prdItems(closed, assigned, showView);
  if (todo.kind === "spec") return specItems(closed, assigned, showView);
  return todoItems(closed, assigned, showView);
}

