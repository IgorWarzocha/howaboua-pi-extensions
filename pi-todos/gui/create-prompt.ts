export function buildCreateBase(kind: "PRD" | "Spec" | "Todo", rules: string, userPrompt: string, cli: string, cwd: string): string {
  const run = `PI_TODOS_CWD="${cwd}" ${cli}`;
  return (
    "Procedure requirements:\n" +
    `1. You MUST use this command prefix for plan creation: ${run}\n` +
    `2. You MUST start by running: ${run} -schema ${kind.toLowerCase()}\n` +
    "3. You MUST read schema output and satisfy every REQUIRED field.\n" +
    "4. You MUST use the same command prefix to execute create.\n" +
    "5. After create, you MUST edit markdown body sections only.\n" +
    "6. You MUST NOT modify frontmatter fields unless explicitly required by these instructions or explicitly requested by the user.\n" +
    "7. You MUST assume this may run in a fresh session with no prior context.\n" +
    "8. You MAY ask clarifying questions when requirements are ambiguous.\n\n" +
    `${rules}\n\n` +
    `User request: ${userPrompt}`
  );
}
