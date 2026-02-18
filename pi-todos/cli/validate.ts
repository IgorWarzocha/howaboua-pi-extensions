import fs from "node:fs/promises";
import path from "node:path";
import { parseTodoContent } from "../parser.js";

type Kind = "prd" | "spec" | "todo";

interface Issue {
  kind: Kind;
  name: string;
  issue: string;
  file: string;
}

interface Recommendation {
  target: string;
  kind: Kind;
  name: string;
  reason: string;
}

interface Node {
  path: string;
  id: string;
  kind: Kind;
  title: string;
  links: { root_abs?: string; prds?: string[]; specs?: string[]; todos?: string[] };
}

function normalize(value: string): string {
  return value.replaceAll("\\", "/");
}

function rel(root: string, file: string): string {
  return normalize(path.relative(root, file));
}

function bucket(kind: Kind): "prds" | "specs" | "todos" {
  if (kind === "prd") return "prds";
  if (kind === "spec") return "specs";
  return "todos";
}

function parseKind(value: string | undefined): Kind {
  if (value === "prd") return "prd";
  if (value === "spec") return "spec";
  return "todo";
}

async function scan(root: string): Promise<Node[]> {
  const dirs = ["prds", "specs", "todos"];
  const out: Node[] = [];
  for (const dir of dirs) {
    const base = path.join(root, ".pi", "plans", dir);
    let names: string[] = [];
    try {
      names = await fs.readdir(base);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const file = path.join(base, name);
      const raw = await fs.readFile(file, "utf8");
      const id = name.slice(0, -3);
      const parsed = parseTodoContent(raw, id);
      out.push({
        path: file,
        id,
        kind: parseKind(parsed.kind),
        title: parsed.title || "(untitled)",
        links: parsed.links || {},
      });
    }
  }
  return out;
}

function refs(node: Node, key: "prds" | "specs" | "todos", root: string): string[] {
  const base = node.links.root_abs || root;
  const list = node.links[key] || [];
  return list.map((item) => normalize(path.resolve(base, item)));
}

function addIssue(list: Issue[], node: Node, issue: string): void {
  list.push({ kind: node.kind, name: node.title, issue, file: node.path });
}

function addRec(list: Recommendation[], node: Node, target: Node, reason: string): void {
  if (list.some((item) => item.target === target.path)) return;
  list.push({ target: target.path, kind: target.kind, name: target.title, reason });
}

export async function validateItem(
  root: string,
  filePath: string,
): Promise<{ issues: Issue[]; recommendations: Recommendation[] }> {
  const nodes = await scan(root);
  const map = new Map<string, Node>();
  for (const node of nodes) map.set(normalize(node.path), node);
  const current = map.get(normalize(path.resolve(filePath)));
  if (!current) throw new Error("Validate target not found in .pi/plans.");
  const issues: Issue[] = [];
  const recs: Recommendation[] = [];
  const hasLinks =
    (current.links.prds?.length || 0) +
      (current.links.specs?.length || 0) +
      (current.links.todos?.length || 0) >
    0;
  if (hasLinks && !current.links.root_abs) addIssue(issues, current, "missing root_abs for links");
  const keys: Array<"prds" | "specs" | "todos"> = ["prds", "specs", "todos"];
  for (const key of keys) {
    const linked = refs(current, key, root);
    for (const targetPath of linked) {
      const target = map.get(targetPath);
      if (!target) {
        addIssue(issues, current, `broken ${key} link`);
        continue;
      }
      const expect = key === "prds" ? "prd" : key === "specs" ? "spec" : "todo";
      if (target.kind !== expect) {
        addIssue(issues, current, `bucket mismatch for ${target.title}`);
        continue;
      }
      const back = bucket(current.kind);
      const targetBase = target.links.root_abs || root;
      const targetLinks = target.links[back] || [];
      const expectBack = rel(targetBase, current.path);
      if (!targetLinks.includes(expectBack)) {
        addIssue(issues, current, `missing backlink from ${target.title}`);
        addRec(recs, current, target, "restore bidirectional link");
      }
    }
  }
  if (current.kind === "todo") {
    const todoSpecs = new Set<string>(refs(current, "specs", root));
    for (const prdPath of refs(current, "prds", root)) {
      const prd = map.get(prdPath);
      if (!prd) continue;
      const prdSpecs = refs(prd, "specs", root);
      for (const specPath of prdSpecs) {
        if (todoSpecs.has(specPath)) continue;
        const spec = map.get(specPath);
        if (!spec) continue;
        addIssue(issues, current, `todo missing spec from ${prd.title}`);
        addRec(recs, current, spec, "connect todo to PRD-linked spec");
      }
    }
  }
  if (current.kind === "spec") {
    const specPrds = new Set<string>(refs(current, "prds", root));
    for (const todoPath of refs(current, "todos", root)) {
      const todo = map.get(todoPath);
      if (!todo) continue;
      const todoPrds = refs(todo, "prds", root);
      for (const prdPath of todoPrds) {
        if (specPrds.has(prdPath)) continue;
        const prd = map.get(prdPath);
        if (!prd) continue;
        addIssue(issues, current, `spec missing PRD from ${todo.title}`);
        addRec(recs, current, prd, "connect spec to todo-linked PRD");
      }
    }
  }
  if (current.kind === "prd") {
    const prdSpecs = new Set<string>(refs(current, "specs", root));
    for (const todoPath of refs(current, "todos", root)) {
      const todo = map.get(todoPath);
      if (!todo) continue;
      const todoSpecs = refs(todo, "specs", root);
      for (const specPath of todoSpecs) {
        if (prdSpecs.has(specPath)) continue;
        const spec = map.get(specPath);
        if (!spec) continue;
        addIssue(issues, current, `PRD missing spec from ${todo.title}`);
        addRec(recs, current, spec, "connect PRD to todo-linked spec");
      }
    }
  }
  return { issues, recommendations: recs };
}
