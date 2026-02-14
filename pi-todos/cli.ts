#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import { fileURLToPath } from "node:url";

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
  template: boolean;
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
  const file = fileURLToPath(import.meta.url);
  return path.dirname(file);
}

function links(value: string | undefined, root: string): { root_abs: string; prds: string[]; specs: string[]; todos: string[] } {
  if (!value) return { root_abs: root, prds: [], specs: [], todos: [] };
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return {
    root_abs: typeof parsed.root_abs === "string" && parsed.root_abs.trim() ? parsed.root_abs : root,
    prds: Array.isArray(parsed.prds) ? parsed.prds.filter((item): item is string => typeof item === "string") : [],
    specs: Array.isArray(parsed.specs) ? parsed.specs.filter((item): item is string => typeof item === "string") : [],
    todos: Array.isArray(parsed.todos) ? parsed.todos.filter((item): item is string => typeof item === "string") : [],
  };
}

function has(args: string[], names: string[]): boolean {
  for (let index = 0; index < names.length; index += 1) {
    if (args.includes(names[index])) return true;
  }
  return false;
}

function enforce(kind: Kind, args: string[]): void {
  const extra = has(args, ["--agent_rules", "-agent_rules", "--worktree", "-worktree", "--template", "-template"]);
  if (extra) fail("Do not pass managed frontmatter flags (agent_rules/worktree/template). Use create minimal inputs only.");
  const checklist = has(args, ["--checklist", "-checklist"]);
  if (kind !== "todo" && checklist) fail("Checklist is only supported for kind=todo.");
}

function schema(kind: Kind): string {
  const checklist =
    kind === "todo"
      ? "checklist:\n  - id: \"1\"\n    title: \"Define scope\"\n    done: false\n"
      : "checklist: []\n";
  return [
    `Create input schema for ${kind}:`,
    "---",
    "command: create",
    `kind: ${kind}`,
    "title: <string>",
    "tags: <csv optional>",
    "root: <absolute-path optional>",
    "links: <json optional with root_abs/prds/specs/todos>",
    "request: <string optional>",
    "checklist: only for kind=todo",
    "Managed by CLI (do not pass): id/status/timestamps/agent_rules/worktree/template",
    checklist.trimEnd(),
    "---",
  ].join("\n");
}

function body(kind: Kind, request: string): string {
  if (kind === "prd") {
    return `## Objective\n\n${request}\n\n## Scope\n\n- Define product scope\n\n## Constraints\n\n- Lifecycle is user-controlled\n\n## Deliverables\n\n- PRD, linked specs, linked todos\n\n## Acceptance Criteria\n\n- Requirements are testable and explicit\n`;
  }
  if (kind === "spec") {
    return `## Objective\n\n${request}\n\n## Scope\n\n- Technical design and behavior\n\n## Constraints\n\n- Deterministic and verifiable behavior\n\n## Verification Plan\n\n- Validate against linked PRD and todos\n`;
  }
  return `## Objective\n\n${request}\n\n## Scope\n\n- Implement scoped task\n\n## Verification Plan\n\n- Confirm checklist completion and behavior\n`;
}

async function create(args: string[]): Promise<void> {
  const value = kind(pick(args, ["--kind", "-kind"]));
  enforce(value, args);
  const title = pick(args, ["--title", "-title"])?.trim();
  if (!title) fail("Missing --title for create command.");
  const request = pick(args, ["--request", "-request"])?.trim() || title;
  const tags = (pick(args, ["--tags", "-tags"]) || "planning").split(",").map((item) => item.trim()).filter(Boolean);
  const root = pick(args, ["--root", "-root"])?.trim() || dir();
  const linkArg = pick(args, ["--links", "-links"]);
  const valueId = id();
  const ts = now();
  const valueLinks = links(linkArg, root);
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
    template: false,
  };
  const outdir = path.join(root, "plans", map(value));
  await fs.mkdir(outdir, { recursive: true });
  const file = path.join(outdir, `${valueId}.md`);
  const front = YAML.stringify(entry).trimEnd();
  const text = `---\n${front}\n---\n\n${body(value, request)}`;
  await fs.writeFile(file, `${text.trimEnd()}\n`, "utf8");
  process.stdout.write(`Created: ${file}\n`);
  process.stdout.write("Next: Open the file and replace scaffold body sections with full content.\n");
  process.stdout.write("Next: Do NOT edit frontmatter unless the user explicitly asks for frontmatter changes.\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length) fail("Missing command. Use '-schema <kind>' or 'create --kind <kind> --title <title>'.");
  if (args[0] === "-schema") {
    const value = kind(args[1]);
    process.stdout.write(`${schema(value)}\n`);
    return;
  }
  if (args[0] === "create" || args[0] === "-create") {
    await create(args);
    return;
  }
  fail("Unsupported command. Use '-schema' or 'create'.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown CLI failure";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
