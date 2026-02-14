import { buildCreateBase } from "../gui/create-prompt.js";

export function buildCreateTodoPrompt(userPrompt: string, cli: string, cwd: string): string {
  return buildCreateBase(
    "Todo",
    "You MUST produce a todo-kind plan with a non-empty checklist using short IDs and done booleans. You MUST NOT close lifecycle state automatically.",
    userPrompt,
    cli,
    cwd,
  );
}

