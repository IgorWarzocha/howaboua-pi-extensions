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
  return `work on todo "${title}"\n\nYou MUST read these files before making changes:\n${text}\n\nYou MUST ensure linked PRD/spec/todo markdowns form a complete bidirectional web. If a gap is found, you MUST update links by merging entries instead of overwriting arrays.`;
}

export function buildReviewPrompt(title: string, links?: {
  root_abs?: string;
  prds?: string[];
  specs?: string[];
  todos?: string[];
  reads?: string[];
}): string {
  const work = buildWorkPrompt(title, links);
  return `${work}\n\nThen review whether implementation is complete, list gaps, and list missing relationship links across PRD/spec/todo files.`;
}

export function buildValidateAuditPrompt(currentPath: string, scope: string[]): string {
  const lines = scope.map((item) => `- ${item}`).join("\n");
  return (
    `Perform an audit on the following item:\n${currentPath}\n\n` +
    "Requirements:\n" +
    "1. You MUST treat this as an audit-only task. You MUST NOT edit any files.\n" +
    "2. You MUST read every listed file before producing findings.\n" +
    "3. You MUST verify frontmatter link integrity across PRD/spec/todo items: bidirectional links, kind-correct buckets, root_abs presence when repo-relative links exist, missing or broken linked files, duplicate or stale links.\n" +
    "4. You MUST verify cross-document consistency: requirement coverage across PRD -> spec -> todo, contradictory statements, missing implementation tasks for required spec behavior, orphaned or obsolete items.\n" +
    "5. You MUST separate deterministic facts from judgment calls.\n" +
    "6. You MUST output a short Executive Summary first.\n" +
    "7. You MUST output one findings table with these exact columns: kind | name | issue (3-5 words).\n" +
    "8. You MUST include only issues in the table.\n" +
    "9. After the table, you MUST output a markdown bullet list named 'Proposed Changes' with concrete recommended changes/questions.\n" +
    "10. You MAY ask clarifying questions only if a blocking ambiguity prevents assessment.\n\n" +
    `Audit scope (absolute paths):\n${lines}`
  );
}
