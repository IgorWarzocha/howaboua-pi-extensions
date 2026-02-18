import type { TodoFrontMatter, TodoListMode } from "../types.js";
import { todoType } from "../entity.js";

export function noun(todo: TodoFrontMatter): string {
  const type = todoType(todo);
  if (type === "prd") return "PRD";
  if (type === "spec") return "spec";
  return "todo";
}

export function nounFromMode(mode: TodoListMode): string {
  if (mode === "prds") return "PRD";
  if (mode === "specs") return "spec";
  return "todo";
}
