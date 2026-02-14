import type { TodoFrontMatter, TodoRecord } from "../types.js";
import { buildRefinePrompt, buildReviewPrompt, buildWorkPrompt } from "../format/prompts.js";

export function refine(title: string): string {
  return buildRefinePrompt(title);
}

export function work(title: string, links?: TodoFrontMatter["links"]): string {
  return buildWorkPrompt(title, links);
}

export function review(title: string, links?: TodoFrontMatter["links"]): string {
  return buildReviewPrompt(title, links);
}

export function done(action: "complete" | "abandon", record: TodoRecord): string {
  const verb = action === "complete" ? "Completed" : "Abandoned";
  return `${verb} todo "${record.title || "(untitled)"}"`;
}

export function released(record: TodoRecord): string {
  return `Released todo "${record.title || "(untitled)"}"`;
}

export function deleted(record: TodoRecord): string {
  return `Deleted todo "${record.title || "(untitled)"}"`;
}

export function reopened(record: TodoRecord): string {
  return `Reopened todo "${record.title || "(untitled)"}" and reset checklist`;
}

