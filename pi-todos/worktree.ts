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
  let current = path.resolve(root);
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

async function pickRepo(repos: Repo[], ctx: ExtensionCommandContext): Promise<Repo | { error: string }> {
  if (repos.length === 1) return repos[0];
  if (!ctx.hasUI) return { error: "Multiple git repositories found. User selection required." };
  for (const repo of repos) {
    const ok = await ctx.ui.confirm("Select repository", `Use repository:\n${repo.path}`);
    if (ok) return repo;
  }
  return { error: "Repository selection required." };
}

async function pickMode(
  repos: Repo[],
  root: string,
  record: TodoFrontMatter,
  ctx: ExtensionCommandContext,
): Promise<{ mode: "none" } | { mode: "init" } | { mode: "repo"; repo: string }> {
  if (!ctx.hasUI) {
    if (!repos.length) return { mode: "none" };
    return { mode: "repo", repo: repos[0].path };
  }

  const repo = repos.length === 1 ? repos[0] : null;
  let worktreeInfo = "";
  if (repo) {
    try {
      const list = parseWorktrees(run("git", ["worktree", "list", "--porcelain"], repo.path));
      const current = list.find(w => w.path === path.resolve(repo.path));
      const others = list.filter(w => w.path !== path.resolve(repo.path));
      worktreeInfo = `\nCurrent branch: ${current?.branch || "detached"}`;
      if (others.length) {
        worktreeInfo += `\nExisting worktrees:\n${others.map(w => `  - ${w.branch} (${path.basename(w.path)})`).join("\n")}`;
      }
    } catch {
      // ignore git errors for info string
    }
  }

  const branch = record.worktree?.branch || normalizeBranch(record);
  const useWorktree = await ctx.ui.confirm(
    "Worktree Orchestration",
    `Would you like to create/switch to a dedicated worktree for this task?${worktreeInfo}\n\nTarget branch: ${branch}`
  );

  if (!useWorktree) return { mode: "none" };

  if (!repos.length) {
    const init = await ctx.ui.confirm(
      "Initialize repository",
      "No repository found. Initialize git repository here and create initial commit?",
    );
    if (init) return { mode: "init" };
    return { mode: "none" };
  }

  const selected = await pickRepo(repos, ctx);
  if ("error" in selected) return { mode: "none" };
  return { mode: "repo", repo: selected.path };
}

function ensureRepoWorktree(record: TodoFrontMatter, repo: string) {
  const branch = record.worktree?.branch || normalizeBranch(record);
  const repoPath = path.resolve(repo);
  const list = parseWorktrees(run("git", ["worktree", "list", "--porcelain"], repoPath));

  // If we are already in a worktree/repo that has this branch checked out
  const current = list.find(w => w.path === process.cwd() || w.path === repoPath);
  if (current?.branch === branch) {
    return { ok: true as const, path: current.path, branch, created: false };
  }

  const existing = list.find((item) => item.branch === branch);
  if (existing) return { ok: true as const, path: existing.path, branch, created: false };
  const dir = path.join(repoPath, ".pi", "worktrees", branch.replace(/[\/]/g, "-"));
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const known = run("git", ["branch", "--list", branch], repoPath);
  if (known) run("git", ["worktree", "add", dir, branch], repoPath);
  if (!known) run("git", ["worktree", "add", "-b", branch, dir], repoPath);
  return { ok: true as const, path: dir, branch, created: true };
}

export async function ensureWorktree(record: TodoFrontMatter, ctx: ExtensionCommandContext) {
  const root = record.links?.root_abs ?? ctx.cwd;
  const rootRepo = findEnclosingRepo(root);
  const repos = rootRepo ? [rootRepo] : findRepos(root);

  const pick = await pickMode(repos, root, record, ctx);
  if (pick.mode === "none") return { ok: true as const, skipped: true };
  if (pick.mode === "init") {
    initRepo(root);
    return ensureRepoWorktree(record, root);
  }
  return ensureRepoWorktree(record, pick.repo);
}

