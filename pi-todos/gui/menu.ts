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
  const base =
    type === "prd"
      ? prdItems(closed, assigned, jump, showView)
      : type === "spec"
        ? specItems(closed, assigned, jump, showView)
        : todoItems(closed, assigned, jump, showView);
  if (!todo.checklist?.length) return base;
  const insert = base.findIndex((item) => item.value === "refine");
  const entry = {
    value: "edit-checklist",
    label: "edit-checklist",
    description: "Edit checklist with AI",
  };
  if (insert === -1) return [...base, entry];
  return [...base.slice(0, insert), entry, ...base.slice(insert)];
}
