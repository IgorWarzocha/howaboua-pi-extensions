import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { load } from "./config.js";
import { configure } from "./setup.js";
import { pick } from "./ui.js";
import { run } from "./run.js";
import { setup, tasks } from "./tasks/index.js";
import { ensure } from "./repos.js";
import { parse } from "./args.js";

const selectRepo = "Select repository for this session";

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

function preview(text: string): string {
  const line = text.split("\n").map((item) => item.trim()).find((item) => item.length > 0) ?? "";
  if (!line) {
    return "";
  }
  if (line.length <= 100) {
    return line;
  }
  return `${line.slice(0, 97)}...`;
}

export default function repo(pi: ExtensionAPI): void {
  pi.registerCommand("repo", {
    description: "This command MUST open a GUI and MAY run one repository workflow in a silent background Pi subagent.",
    handler: async (args, ctx) => {
      const parsed = parse(args);
      const selected = await ensure(ctx, parsed.mode === "select");
      const config = load();

      if (parsed.mode === "select") {
        ctx.ui.notify(`Repository for this cwd/session set to: ${selected.path}`, "info");
        return;
      }

      if (parsed.mode === "issue" || parsed.mode === "pr") {
        const id = parsed.mode === "issue" ? "issue" : "pr";
        const task = tasks.find((item) => item.id === id);
        if (!task) {
          throw new Error("Task MUST exist for parsed mode.");
        }
        const repo = { path: selected.path, slug: await slug(selected, ctx.ui) };
        ctx.ui.notify(`Running '${task.title}' in background subagent at ${selected.path}...`, "info");
        let seen = "";
        let shown = "";
        const out = await run(task, config.models[task.id], config.thinking[task.id], selected.path, repo, parsed.number, parsed.extra, (update) => {
          const chain = update.tools.join(" -> ");
          if (chain && chain !== seen) {
            seen = chain;
            ctx.ui.notify(`Subagent tools: ${chain}`, "info");
          }
          const head = preview(update.output);
          if (head && head !== shown) {
            shown = head;
            ctx.ui.notify(`Subagent: ${head}`, "info");
          }
        });
        pi.sendMessage({
          customType: "repo-subagent-result",
          display: true,
          content: [{ type: "text", text: `### /repo result\n\n${out}` }],
        });
        return;
      }

      const labels = tasks.map((item) => item.title);
      labels.push(selectRepo);
      labels.push(setup);
      const picked = await pick(labels, "Repo", ctx.ui);
      if (!picked) {
        return;
      }

      if (picked === selectRepo) {
        const forced = await ensure(ctx, true);
        ctx.ui.notify(`Repository for this cwd/session set to: ${forced.path}`, "info");
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

      const target = selected.path;
      const repo = { path: selected.path, slug: task.mode === "local" ? selected.slug : await slug(selected, ctx.ui) };
      const ref = task.mode === "gh-issue" ? await number("Issue number", ctx.ui) : task.mode === "gh-pr" ? await number("PR number", ctx.ui) : undefined;
      if ((task.mode === "gh-issue" || task.mode === "gh-pr") && !ref) {
        return;
      }

      ctx.ui.notify(`Running '${task.title}' in background subagent at ${target}...`, "info");
      let seen = "";
      let shown = "";
      const out = await run(task, config.models[task.id], config.thinking[task.id], target, repo, ref, undefined, (update) => {
        const chain = update.tools.join(" -> ");
        if (chain && chain !== seen) {
          seen = chain;
          ctx.ui.notify(`Subagent tools: ${chain}`, "info");
        }
        const head = preview(update.output);
        if (head && head !== shown) {
          shown = head;
          ctx.ui.notify(`Subagent: ${head}`, "info");
        }
      });
      pi.sendMessage({
        customType: "repo-subagent-result",
        display: true,
        content: [{ type: "text", text: `### /repo result\n\n${out}` }],
      });
    },
  });
}
