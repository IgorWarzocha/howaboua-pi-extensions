import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { load } from "./config.js";
import { configure } from "./setup.js";
import { pick } from "./ui.js";
import { run } from "./run.js";
import { setup, tasks } from "./tasks.js";
import { ensure } from "./repos.js";
import { parse } from "./args.js";

async function number(title: string, ui: { input: (title: string, placeholder?: string) => Promise<string | undefined> }): Promise<number | undefined> {
  const raw = await ui.input(title, "Enter a numeric id");
  if (!raw) {
    return undefined;
  }
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Issue/PR number MUST be a positive integer.");
  }
  return value;
}

async function slug(repo: { slug: string }, ui: { input: (title: string, placeholder?: string) => Promise<string | undefined> }): Promise<string> {
  if (repo.slug) {
    return repo.slug;
  }
  const raw = await ui.input("GitHub repository", "owner/repo");
  if (!raw || !raw.includes("/")) {
    throw new Error("GitHub repository MUST be provided as owner/repo.");
  }
  return raw.trim();
}

export default function repo(pi: ExtensionAPI): void {
  pi.registerCommand("repo", {
    description: "This command MUST open a GUI and MAY run one repository workflow in a silent background Pi subagent.",
    handler: async (args, ctx) => {
      const parsed = parse(args);
      const selected = await ensure(ctx);
      const config = load();

      if (parsed.mode === "issue" || parsed.mode === "pr") {
        const id = parsed.mode === "issue" ? "issue" : "pr";
        const task = tasks.find((item) => item.id === id);
        if (!task) {
          throw new Error("Task MUST exist for parsed mode.");
        }
        const repo = { path: selected.path, slug: await slug(selected, ctx.ui) };
        ctx.ui.notify(`Running '${task.title}' in background subagent...`, "info");
        const out = await run(task, config.models[task.id], config.thinking[task.id], selected.path, repo, parsed.number, parsed.extra);
        pi.sendMessage({
          customType: "repo-subagent-result",
          display: true,
          content: [{ type: "text", text: `### /repo result\n\n${out}` }],
        });
        return;
      }

      const labels = tasks.map((item) => item.title);
      labels.push(setup);
      const picked = await pick(labels, "Repo", ctx.ui);
      if (!picked) {
        return;
      }

      if (picked === setup) {
        await configure(ctx);
        return;
      }

      const task = tasks.find((item) => item.title === picked);
      if (!task) {
        throw new Error("Selected workflow MUST map to a known task.");
      }

      const target = task.mode === "local" ? ctx.cwd : selected.path;
      const repo = task.mode === "local" ? undefined : { path: selected.path, slug: await slug(selected, ctx.ui) };
      const ref = task.mode === "gh-issue" ? await number("Issue number", ctx.ui) : task.mode === "gh-pr" ? await number("PR number", ctx.ui) : undefined;
      if (task.mode !== "local" && !repo) {
        throw new Error("GH task MUST have repository context.");
      }
      if ((task.mode === "gh-issue" || task.mode === "gh-pr") && !ref) {
        return;
      }

      ctx.ui.notify(`Running '${task.title}' in background subagent...`, "info");
      const out = await run(task, config.models[task.id], config.thinking[task.id], target, repo, ref, undefined);
      pi.sendMessage({
        customType: "repo-subagent-result",
        display: true,
        content: [{ type: "text", text: `### /repo result\n\n${out}` }],
      });
    },
  });
}
