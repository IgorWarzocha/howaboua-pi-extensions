import type { TodoFrontMatter, TodoListMode } from "../types.js";

export function noun(todo: TodoFrontMatter): string {
  if (todo.kind === "prd") return "PRD";
  if (todo.kind === "spec") return "spec";
  return "todo";
}

export function nounFromMode(mode: TodoListMode): string {
  if (mode === "prds") return "PRD";
  if (mode === "specs") return "spec";
  return "todo";
}

