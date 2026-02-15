#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import { resolveRoot } from "./cli/root.js";
import { validateItem } from "./cli/validate.js";
type Kind = "prd" | "spec" | "todo";

interface Entry {
  id: string;
  kind: Kind;
  title: string;
  tags: string[];
  status: string;
  created_at: string;
  modified_at: string;
  assigned_to_session: null;
  agent_rules: string;
  worktree: { enabled: boolean; branch: string };
  links: { root_abs: string; prds: string[]; specs: string[]; todos: string[] };
  checklist: Array<{ id: string; title: string; done: boolean }>;
}

function fail(message: string): never {
  throw new Error(message);
}

function now(): string {
  return new Date().toISOString();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function kind(value: string | undefined): Kind {
  if (value === "prd" || value === "spec" || value === "todo") return value;
  fail("Invalid kind. Expected one of: prd, spec, todo.");
}

function map(kind: Kind): string {
  if (kind === "prd") return "prds";
  if (kind === "spec") return "specs";
  return "todos";
}

function branch(kind: Kind, title: string, id: string): string {
  const value = slug(title) || id;
  if (kind === "prd") return `feat/prd-${value}`;
  return `feat/todo-${value}`;
}

function id(): string {
  return crypto.randomBytes(4).toString("hex");
}

function field(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function pick(args: string[], names: string[]): string | undefined {
  for (let index = 0; index < names.length; index += 1) {
    const value = field(args, names[index]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function dir(): string {
  return resolveRoot();
}

function links(root: string): { root_abs: string; prds: string[]; specs: string[]; todos: string[] } {
  return { root_abs: root, prds: [], specs: [], todos: [] };
}

function has(args: string[], names: string[]): boolean {
  for (let index = 0; index < names.length; index += 1) {
    if (args.includes(names[index])) return true;
  }
  return false;
}

function enforce(kind: Kind, args: string[]): void {
  const extra = has(args, ["--agent_rules", "-agent_rules", "--worktree", "-worktree", "--template", "-template", "--links", "-links", "--request", "-request", "--root", "-root"]);
  if (extra) fail("Do not pass managed flags (agent_rules/worktree/template/links/request/root). Use minimal create inputs only.");
  const checklist = has(args, ["--checklist", "-checklist"]);
  if (kind !== "todo" && checklist) fail("Checklist is only supported for kind=todo.");
}

function schema(kind: Kind): string {
  const lines = [
    `Create input schema for ${kind}:`,
    "---",
    "command: create",
    `kind: ${kind}`,
    "title: <string>",
    "tags: <csv> # REQUIRED",
    "body: <markdown> # REQUIRED",
  ];
  if (kind === "todo") lines.push("checklist: <json-array> # REQUIRED");
  lines.push("---");
  return lines.join("\n");
}

async function create(args: string[]): Promise<void> {
  const value = kind(pick(args, ["--kind", "-kind"]));
  enforce(value, args);
  const title = pick(args, ["--title", "-title"])?.trim();
  if (!title) fail("Missing --title for create command.");
  const body = pick(args, ["--body", "-body"])?.trim();
  if (!body) fail("Missing --body for create command.");
  const tags = (pick(args, ["--tags", "-tags"]) || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!tags.length) fail("Missing --tags for create command.");
  const root = dir();
  const valueId = id();
  const ts = now();
  const valueLinks = links(root);
  const entry: Entry = {
    id: valueId,
    kind: value,
    title,
    tags,
    status: "open",
    created_at: ts,
    modified_at: ts,
    assigned_to_session: null,
    agent_rules: "MUST follow linked plans and keep lifecycle user-controlled.",
    worktree: { enabled: true, branch: branch(value, title, valueId) },
    links: valueLinks,
    checklist:
      value === "todo"
        ? [
            { id: "1", title: "Define scope", done: false },
            { id: "2", title: "Implement changes", done: false },
            { id: "3", title: "Verify acceptance criteria", done: false },
          ]
        : [],
  };
  const outdir = path.join(root, ".pi", "plans", map(value));
  await fs.mkdir(outdir, { recursive: true });
  const file = path.join(outdir, `${valueId}.md`);
  const front = YAML.stringify(entry).trimEnd();
  const text = `---\n${front}\n---\n\n${body}`;
  await fs.writeFile(file, `${text.trimEnd()}\n`, "utf8");
  process.stdout.write(`Created: ${file}\n`);
  if (value === "prd") process.stdout.write("Next: You MUST ask the user whether they want to refine this PRD now.\n");
  if (value === "spec") process.stdout.write("Next: You MUST ask the user whether they want to refine this spec now.\n");
  if (value === "todo") process.stdout.write("Next: You MUST ask the user whether they want to refine this todo now.\n");
  process.stdout.write("Next: You MUST keep frontmatter stable unless the user explicitly requests frontmatter changes.\n");
  if (value === "prd") process.stdout.write("Next: You SHOULD suggest creating either a spec or a todo from this PRD.\n");
  if (value === "spec") process.stdout.write("Next: You SHOULD suggest creating a todo from this spec.\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length) fail("Missing command. Use '-schema <kind>' or 'create --kind <kind> --title <title>'.");
  if (args[0] === "--validate" || args[0] === "-validate") {
    const filePath = pick(args, ["--filepath", "-filepath"]);
    if (!filePath) fail("Missing --filepath for validate command.");
    const result = await validateItem(dir(), filePath);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (args[0] === "-schema") {
    const value = kind(args[1]);
    process.stdout.write(`${schema(value)}\n`);
    return;
  }
  if (args[0] === "create" || args[0] === "-create") {
    await create(args);
    return;
  }
  fail("Unsupported command. Use '--validate', '-schema', or 'create'.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown CLI failure";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
