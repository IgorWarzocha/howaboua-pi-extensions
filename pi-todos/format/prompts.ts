import type { ChecklistItem } from "../types.js";
import path from "node:path";

export function buildRefinePrompt(title: string): string {
  return (
    `let's refine task "${title}":\n\n` +
    "You MUST NOT rewrite the todo yet. You MUST ask clear, concrete questions to clarify:\n" +
    "- What files MUST be read?\n" +
    "- What dependencies exist?\n" +
    "- What is the acceptance criteria?\n\n" +
    "You SHOULD research the codebase before asking questions. You MAY ask me for clarification on ambiguous points. " +
    "Wait for my answers before drafting any structured description.\n\n"
  );
}

function buildCreateBase(kind: "PRD" | "Spec" | "Todo", rules: string, userPrompt: string, cli: string, cwd: string): string {
  const run = `PI_TODOS_CWD="${cwd}" ${cli}`;
  return (
    `You are creating a ${kind} plan document in the pi-todos planning system.\n\n` +
    "Procedure requirements:\n" +
    `1. You MUST use this command prefix for plan creation: ${run}\n` +
    `2. You MUST start by running: ${run} -schema ${kind.toLowerCase()}\n` +
    "3. You MUST read schema output and satisfy every REQUIRED field.\n" +
    "4. You MUST use the same command prefix to execute create.\n" +
    "5. After create, you MUST edit markdown body sections only.\n" +
    "6. You MUST NOT modify frontmatter fields unless the user explicitly requests a frontmatter change.\n" +
    "7. You MAY ask clarifying questions when requirements are ambiguous.\n\n" +
    `${rules}\n\n` +
    `User request: ${userPrompt}`
  );
}

export function buildCreatePrdPrompt(userPrompt: string, cli: string, cwd: string): string {
  return buildCreateBase(
    "PRD",
    "You MUST produce a PRD-kind plan with objective, scope, constraints, deliverables, and acceptance criteria.",
    userPrompt,
    cli,
    cwd,
  );
}

export function buildCreateSpecPrompt(userPrompt: string, cli: string, cwd: string): string {
  return buildCreateBase(
    "Spec",
    "You MUST produce a spec-kind plan tied to a PRD. You MUST define deterministic behavior, constraints, and verification plan. You MUST keep lifecycle user-controlled.",
    userPrompt,
    cli,
    cwd,
  );
}

export function buildCreateTodoPrompt(userPrompt: string, cli: string, cwd: string): string {
  return buildCreateBase(
    "Todo",
    "You MUST produce a todo-kind plan with a non-empty checklist using short IDs and done booleans. You MUST NOT close lifecycle state automatically.",
    userPrompt,
    cli,
    cwd,
  );
}

export function buildEditChecklistPrompt(
  title: string,
  checklist: ChecklistItem[],
  userIntent: string,
): string {
  const checklistText = checklist
    .map((item) => {
      const status = item.done === true || item.status === "checked" ? "[x]" : "[ ]";
      return `  ${status} ${item.id}: ${item.title}`;
    })
    .join("\n");
  return (
    `Update the checklist for "${title}" based on this request:\n` +
    `"${userIntent}"\n\n` +
    `Current checklist:\n${checklistText}\n\n` +
    "Edit the markdown frontmatter checklist directly and keep existing fields stable. " +
    'Assign short IDs to new items (e.g., "1", "2", "3").'
  );
}

function normalizePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of paths) {
    const value = item.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    list.push(value);
  }
  return list;
}

export function resolveLinkedPaths(links?: {
  root_abs?: string;
  prds?: string[];
  specs?: string[];
  todos?: string[];
  reads?: string[];
}): string[] {
  const base = links?.root_abs ?? "";
  const rel = [...(links?.prds ?? []), ...(links?.specs ?? []), ...(links?.todos ?? []), ...(links?.reads ?? [])];
  const abs = normalizePaths(
    rel.map((item) => {
      if (!base) return item;
      return path.resolve(base, item);
    }),
  );
  return abs;
}

export function buildWorkPrompt(title: string, links?: {
  root_abs?: string;
  prds?: string[];
  specs?: string[];
  todos?: string[];
  reads?: string[];
}): string {
  const abs = resolveLinkedPaths(links);
  if (!abs.length) return `work on todo "${title}"`;
  const text = abs.map((item) => `- ${item}`).join("\n");
  return `work on todo "${title}"\n\nYou MUST read these files before making changes:\n${text}`;
}

export function buildReviewPrompt(title: string, links?: {
  root_abs?: string;
  prds?: string[];
  specs?: string[];
  todos?: string[];
  reads?: string[];
}): string {
  const work = buildWorkPrompt(title, links);
  return `${work}\n\nThen review whether implementation is complete and list gaps.`;
}
