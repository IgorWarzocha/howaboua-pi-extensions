import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Repo, Ui } from "./types.js";
import { pick } from "./ui.js";

const state = new Map<string, Repo>();

function key(ctx: { cwd: string; sessionManager?: unknown }): string {
  const root = resolve(ctx.cwd);
  if (!ctx.sessionManager || typeof ctx.sessionManager !== "object") {
    return root;
  }
  if (!("getSessionId" in ctx.sessionManager)) {
    return root;
  }
  const get = ctx.sessionManager.getSessionId;
  if (typeof get !== "function") {
    return root;
  }
  const id = get.call(ctx.sessionManager) as unknown;
  if (!id || typeof id !== "string") {
    return root;
  }
  return `${id}:${root}`;
}

function dirs(cwd: string): string[] {
  const read = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => join(dir, item.name));
    } catch {
      return [];
    }
  };
  const out = [resolve(cwd)];
  const level1 = read(cwd);
  for (const one of level1) {
    out.push(one);
  }
  for (const one of level1) {
    const level2 = read(one);
    for (const two of level2) {
      out.push(two);
    }
  }
  return out;
}

function git(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

function parse(remote: string): string {
  const text = remote.trim().replace(/\.git$/, "");
  const ssh = text.match(/^[^@]+@[^:]+:([^/]+\/[^/]+)$/);
  if (ssh && ssh[1]) {
    return ssh[1];
  }
  const https = text.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+)$/);
  if (https && https[1]) {
    return https[1];
  }
  return "";
}

function slug(dir: string): string {
  const out = spawnSync("git", ["remote", "get-url", "origin"], { cwd: dir, encoding: "utf-8" });
  if (out.status !== 0) {
    return "";
  }
  return parse(out.stdout);
}

function init(cwd: string): Repo {
  const init = spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
  if (init.status !== 0) {
    throw new Error(`git init MUST succeed: ${init.stderr || init.stdout}`);
  }
  const readme = join(cwd, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(readme, "# Repository\n");
  }
  const add = spawnSync("git", ["add", "-A"], { cwd, encoding: "utf-8" });
  if (add.status !== 0) {
    throw new Error(`git add MUST succeed: ${add.stderr || add.stdout}`);
  }
  const commit = spawnSync("git", ["commit", "-m", "chore: initial commit"], {
    cwd,
    encoding: "utf-8",
  });
  if (commit.status !== 0) {
    throw new Error(`Initial commit MUST succeed: ${commit.stderr || commit.stdout}`);
  }
  return { path: cwd, slug: slug(cwd) };
}

export async function ensure(
  ctx: { cwd: string; ui: Ui; sessionManager?: unknown },
  force?: boolean,
): Promise<Repo> {
  const id = key(ctx);
  const found = force ? undefined : state.get(id);
  if (found) {
    return found;
  }
  const list = dirs(ctx.cwd)
    .filter((dir, at, all) => all.indexOf(dir) === at)
    .filter((dir) => git(dir));
  if (list.length === 0) {
    const made = await pick(
      ["Create git repo here", "Cancel"],
      "No git repository found in cwd or two levels down",
      ctx.ui,
    );
    if (made !== "Create git repo here") {
      throw new Error("A repository MUST be selected for this session.");
    }
    const repo = init(ctx.cwd);
    state.set(id, repo);
    return repo;
  }
  const rows = list.map((dir) => {
    const rel = relative(ctx.cwd, dir) || ".";
    return rel;
  });
  const picked = await pick(rows, "Select repository for this session", ctx.ui);
  if (!picked) {
    throw new Error("Repository selection MUST be completed.");
  }
  const at = rows.indexOf(picked);
  const dir = list[at];
  if (!dir) {
    throw new Error("Selected repository MUST map to a known path.");
  }
  const repo = { path: dir, slug: slug(dir) };
  state.set(id, repo);
  return repo;
}
