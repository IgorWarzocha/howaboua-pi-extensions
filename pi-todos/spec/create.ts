import { buildCreateBase } from "../gui/create-prompt.js";

export function buildCreateSpecPrompt(userPrompt: string, cli: string, cwd: string): string {
  return buildCreateBase(
    "Spec",
    "You MUST produce a spec-kind plan tied to a PRD. You MUST define deterministic behavior, constraints, and verification plan. You MUST keep lifecycle user-controlled.",
    userPrompt,
    cli,
    cwd,
  );
}

