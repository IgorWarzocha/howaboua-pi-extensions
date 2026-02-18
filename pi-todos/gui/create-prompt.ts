export function buildCreateBase(
  type: "PRD" | "Spec" | "Todo",
  rules: string,
  userPrompt: string,
  cli: string,
  cwd: string,
): string {
  const run = `PI_TODOS_CWD="${cwd}" ${cli}`;
  return (
    "Procedure requirements:\n" +
    `1. You MUST use this command prefix for plan creation: ${run}\n` +
    `2. You MUST start by running: ${run} -schema ${type.toLowerCase()}\n` +
    "3. You MUST read schema output and satisfy every REQUIRED field.\n" +
    "4. You MUST use the same command prefix to execute create.\n" +
    "5. After create, you MUST edit markdown body sections only unless the user explicitly requests frontmatter updates.\n" +
    "6. You MUST preserve existing frontmatter arrays by merging entries when link updates are required.\n" +
    "7. You MUST assume this may run in a fresh session with no prior context.\n" +
    "8. You MUST use document type terminology (PRD, spec, todo). You MAY encounter legacy 'kind' fields; treat them as equivalent to 'type'.\n" +
    "9. You MAY ask clarifying questions when requirements are ambiguous.\n\n" +
    `${rules}\n\n` +
    `User request: ${userPrompt}`
  );
}
