import type { TodoFrontMatter, TodoRecord } from "../types.js";
import { resolveLinkedPaths } from "../format/prompts.js";

export function refine(title: string): string {
  return (
    `let's refine PRD "${title}":\n\n` +
    "You MUST NOT rewrite the PRD yet. You MUST ask clear, concrete questions to clarify:\n" +
    "- What files MUST be read?\n" +
    "- What constraints and dependencies exist?\n" +
    "- What acceptance criteria MUST be explicit and testable?\n\n" +
    "You SHOULD research the codebase before asking questions. You MAY ask for clarification on ambiguous points. Wait for user answers before drafting structured content.\n"
  );
}

export function work(title: string, links?: TodoFrontMatter["links"]): string {
  const abs = resolveLinkedPaths(links);
  if (!abs.length) return `work on PRD "${title}"`;
  const text = abs.map((item) => `- ${item}`).join("\n");
  return `work on PRD "${title}"\n\nYou MUST read these files before making changes:\n${text}`;
}

export function review(title: string, links?: TodoFrontMatter["links"]): string {
  return `${work(title, links)}\n\nThen review whether implementation is complete and list gaps.`;
}

export function done(action: "complete" | "abandon", record: TodoRecord): string {
  const verb = action === "complete" ? "Completed" : "Abandoned";
  return `${verb} PRD "${record.title || "(untitled)"}"`;
}

export function released(record: TodoRecord): string {
  return `Released PRD "${record.title || "(untitled)"}"`;
}

export function deleted(record: TodoRecord): string {
  return `Deleted PRD "${record.title || "(untitled)"}"`;
}

export function reopened(record: TodoRecord): string {
  return `Reopened PRD "${record.title || "(untitled)"}" and reset checklist`;
}

