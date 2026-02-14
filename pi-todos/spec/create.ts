import { buildCreateBase } from "../gui/create-prompt.js";

export function buildCreateSpecPrompt(userPrompt: string, cli: string, cwd: string, prds: string[]): string {
  const attach = prds.length
    ? [
        "Attach this spec to these PRDs and treat them as required context:",
        ...prds.map((item) => `- ${item}`),
        "",
        "After creating the spec, you MUST update each listed PRD frontmatter links.specs to include the new spec path (repo-relative).",
        "",
      ].join("\n")
    : "No PRD attachments were selected. This is a standalone spec.\n";
  return buildCreateBase(
    "Spec",
    `${attach}You MUST produce a spec-kind plan tied to PRD context when provided. You MUST define deterministic behavior, constraints, and verification plan. You MUST keep lifecycle user-controlled.`,
    userPrompt,
    cli,
    cwd,
  );
}
