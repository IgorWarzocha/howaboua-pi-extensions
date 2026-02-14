import type { TodoRecord } from "../types.js";
import { prdFooter, prdLeader } from "../prd/detail.js";
import { specFooter, specLeader } from "../spec/detail.js";
import { todoFooter, todoLeader } from "../todo/detail.js";

export function footer(record: TodoRecord): string {
  const hasChecklist = Boolean(record.checklist?.length);
  if (record.kind === "prd") return prdFooter(hasChecklist);
  if (record.kind === "spec") return specFooter(hasChecklist);
  return todoFooter(hasChecklist);
}

export function leader(record: TodoRecord): string {
  const hasChecklist = Boolean(record.checklist?.length);
  if (record.kind === "prd") return prdLeader(hasChecklist);
  if (record.kind === "spec") return specLeader(hasChecklist);
  return todoLeader(hasChecklist);
}

