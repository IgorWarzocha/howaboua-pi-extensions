import { buildCreateBase } from "../gui/create-prompt.js";

export function buildCreateTodoPrompt(userPrompt: string, cli: string, cwd: string, prds: string[], specs: string[]): string {
  const attach =
    prds.length || specs.length
      ? [
          "Attach this todo to selected parent plans and treat them as required context:",
          ...prds.map((item) => `- PRD: ${item}`),
          ...specs.map((item) => `- Spec: ${item}`),
          "",
          "You MUST read every listed parent plan file before drafting or creating the todo.",
          "",
          "After creating the todo, you MUST update each listed parent frontmatter links.todos to include the new todo path (repo-relative).",
          "",
        ].join("\n")
      : "No parent plans were selected. This is a standalone todo.\n";
  return buildCreateBase(
    "Todo",
    `${attach}You MUST produce a todo-kind plan with a non-empty checklist using short IDs and done booleans. You MUST NOT close lifecycle state automatically.`,
    userPrompt,
    cli,
    cwd,
  );
}
