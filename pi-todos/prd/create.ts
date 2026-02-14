import { buildCreateBase } from "../gui/create-prompt.js";

export function buildCreatePrdPrompt(userPrompt: string, cli: string, cwd: string): string {
  return buildCreateBase(
    "PRD",
    "You MUST produce a PRD-kind plan with objective, scope, constraints, deliverables, and acceptance criteria.",
    userPrompt,
    cli,
    cwd,
  );
}

