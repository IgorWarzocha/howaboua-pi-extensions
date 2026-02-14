import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter } from "./types.js";

interface Repo {
  path: string;
}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function exists(file: string): boolean {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

function findRepos(root: string): Repo[] {
  const repos: Repo[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const git = path.join(current, ".git");
    if (exists(git)) {
      repos.push({ path: current });
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules") continue;
      if (entry.name === ".git") continue;
      stack.push(path.join(current, entry.name));
    }
  }
  return repos;
}

function findEnclosingRepo(root: string): Repo | null {
  const first = path.resolve(root);
  let current = first;
  while (true) {
    const git = path.join(current, ".git");
    if (exists(git)) return { path: current };
    const next = path.dirname(current);
    if (next === current) return null;
    current = next;
  }
}

function parseWorktrees(raw: string): { path: string; branch?: string }[] {
  const lines = raw.split("\n");
  const items: { path: string; branch?: string }[] = [];
  let current: { path: string; branch?: string } | null = null;
  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current) items.push(current);
      current = { path: line.slice(9).trim() };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("branch refs/heads/")) current.branch = line.slice(18).trim();
  }
  if (current) items.push(current);
  return items;
}

function normalizeBranch(record: TodoFrontMatter): string {
  const kind = record.kind === "prd" ? "prd" : "todo";
  const slug = (record.title || "task")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return `feat/${kind}-${slug || record.id}`;
}

function initRepo(repo: string): void {
  run("git", ["init"], repo);
  run("git", ["add", "-A"], repo);
  run("git", ["commit", "--allow-empty", "-m", "chore(repo): initial commit"], repo);
}

async function pickRepo(
  repos: Repo[],
  record: TodoFrontMatter,
  ctx: ExtensionCommandContext,
): Promise<Repo | { error: string }> {
  if (repos.length === 1) return repos[0];
  const root = record.links?.root_abs;
  if (root) {
    const found = repos.find((repo) => {
      const rel = path.relative(repo.path, root);
      if (!rel) return true;
      if (rel.startsWith("..")) return false;
      return !path.isAbsolute(rel);
    });
    if (found) return found;
  }
  if (!ctx.hasUI) return { error: "Multiple git repositories found. Set links.root_abs to target repository." };
  for (const repo of repos) {
    const ok = await ctx.ui.confirm("Select repository", `Use repository:\n${repo.path}`);
    if (ok) return repo;
  }
  return { error: "Repository selection required." };
}

export async function ensureWorktree(record: TodoFrontMatter, ctx: ExtensionCommandContext) {
  if (!record.worktree?.enabled) return { ok: true as const };
  const root = record.links?.root_abs ?? ctx.cwd;
  const repos = findRepos(root);
  const enclosing = findEnclosingRepo(root);
  if (enclosing) {
    const found = repos.some((item) => item.path === enclosing.path);
    if (!found) repos.unshift(enclosing);
  }
  if (!repos.length) {
    if (!ctx.hasUI) return { error: "No git repository found." };
    const ok = await ctx.ui.confirm("Initialize repository", "No git repository found. Initialize one now?");
    if (!ok) return { error: "No git repository found." };
    initRepo(root);
    repos.push({ path: root });
  }
  const selected = await pickRepo(repos, record, ctx);
  if ("error" in selected) return selected;
  const repo = selected.path;
  const branch = record.worktree.branch || normalizeBranch(record);
  const list = parseWorktrees(run("git", ["worktree", "list", "--porcelain"], repo));
  const existing = list.find((item) => item.branch === branch);
  if (existing) return { ok: true as const, path: existing.path, branch, created: false };
  const base = path.dirname(repo);
  const dir = path.join(base, "worktrees", branch.replace(/[\/]/g, "-"));
  const known = run("git", ["branch", "--list", branch], repo);
  if (known) run("git", ["worktree", "add", dir, branch], repo);
  if (!known) run("git", ["worktree", "add", "-b", branch, dir], repo);
  return { ok: true as const, path: dir, branch, created: true };
}
