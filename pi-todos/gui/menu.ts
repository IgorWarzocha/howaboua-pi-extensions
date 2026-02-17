import type { SelectItem } from "@mariozechner/pi-tui";
import type { TodoRecord } from "../types.js";
import { prdItems } from "../prd/menu.js";
import { specItems } from "../spec/menu.js";
import { todoItems } from "../todo/menu.js";
import { todoType } from "../entity.js";

export function items(todo: TodoRecord, closed: boolean, showView: boolean): SelectItem[] {
  const assigned = Boolean(todo.assigned_to_session);
  const jump = Boolean(todo.assigned_to_session_file);
  const type = todoType(todo);
  if (type === "prd") return prdItems(closed, assigned, jump, showView);
  if (type === "spec") return specItems(closed, assigned, jump, showView);
  return todoItems(closed, assigned, jump, showView);
}

