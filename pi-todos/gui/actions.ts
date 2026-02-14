import type { TodoFrontMatter, TodoRecord } from "../types.js";
import * as prd from "../prd/actions.js";
import * as spec from "../spec/actions.js";
import * as todo from "../todo/actions.js";

function pick(record: TodoFrontMatter | TodoRecord) {
  if (record.kind === "prd") return prd;
  if (record.kind === "spec") return spec;
  return todo;
}

export function refine(record: TodoFrontMatter): string {
  return pick(record).refine(record.title || "(untitled)");
}

export function work(record: TodoFrontMatter): string {
  return pick(record).work(record.title || "(untitled)", record.links);
}

export function review(record: TodoFrontMatter): string {
  return pick(record).review(record.title || "(untitled)", record.links);
}

export function done(action: "complete" | "abandon", record: TodoRecord): string {
  return pick(record).done(action, record);
}

export function released(record: TodoRecord): string {
  return pick(record).released(record);
}

export function deleted(record: TodoRecord): string {
  return pick(record).deleted(record);
}

export function reopened(record: TodoRecord): string {
  return pick(record).reopened(record);
}

