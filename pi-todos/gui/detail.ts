import type { TodoRecord } from "../types.js";
import { prdFooter, prdLeader } from "../prd/detail.js";
import { specFooter, specLeader } from "../spec/detail.js";
import { todoFooter, todoLeader } from "../todo/detail.js";
import { todoType } from "../entity.js";

export function footer(record: TodoRecord): string {
  const hasChecklist = Boolean(record.checklist?.length);
  const type = todoType(record);
  if (type === "prd") return prdFooter(hasChecklist);
  if (type === "spec") return specFooter(hasChecklist);
  return todoFooter(hasChecklist);
}

export function leader(record: TodoRecord): string {
  const hasChecklist = Boolean(record.checklist?.length);
  const type = todoType(record);
  if (type === "prd") return prdLeader(hasChecklist);
  if (type === "spec") return specLeader(hasChecklist);
  return todoLeader(hasChecklist);
}
