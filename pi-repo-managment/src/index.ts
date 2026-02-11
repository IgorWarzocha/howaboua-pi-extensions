import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Task = {
  id: string;
  title: string;
  prompt: string;
};

type Model = {
  provider: string;
  id: string;
  name: string;
};

type Config = {
  models: Record<string, string>;
  thinking: Record<string, string>;
};

const tasks: Task[] = [
  {
    id: "docs",
    title: "Create or update repository docs",
    prompt: "Stub prompt: You MUST create or update repository documentation based on current project state.",
  },
  {
    id: "agents",
    title: "Create or update AGENTS.md",
    prompt: "Stub prompt: You MUST create or update AGENTS.md with current repository-specific guidance.",
  },
  {
    id: "commit",
    title: "Commit and push via GitHub CLI",
    prompt: "Stub prompt: You MUST prepare a clean commit and push it via gh CLI with safe defaults.",
  },
  {
    id: "reviews",
    title: "Review GitHub issues and PRs via gh CLI",
    prompt: "Stub prompt: You MUST review open GitHub issues and pull requests via gh CLI and report actionable findings.",
  },
];

const setup = "Setup";

function path(cwd: string): string {
  return join(homedir(), ".pi", "repo-managment.json");
}

function load(cwd: string): Config {
  const file = path(cwd);
  if (!existsSync(file)) {
    return { models: {}, thinking: {} };
  }
  const raw = readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as Partial<Config>;
  if (!parsed.models || typeof parsed.models !== "object") {
    throw new Error("Configuration MUST contain a models object.");
  }
  if (parsed.thinking !== undefined && typeof parsed.thinking !== "object") {
    throw new Error("Configuration thinking field MUST be an object when provided.");
  }
  return { models: parsed.models, thinking: parsed.thinking ?? {} };
}

function save(cwd: string, config: Config): void {
  const dir = join(homedir(), ".pi");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path(cwd), JSON.stringify(config, null, 2));
}

function detect(ctx: unknown): Model[] {
  if (!ctx || typeof ctx !== "object") {
    return [];
  }
  if (!("modelRegistry" in ctx)) {
    return [];
  }
  const value = ctx.modelRegistry;
  if (!value || typeof value !== "object") {
    return [];
  }
  if (!("getAvailable" in value)) {
    return [];
  }
  const getter = value.getAvailable;
  if (typeof getter !== "function") {
    return [];
  }
  const list = getter.call(value) as unknown;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const model = item as { provider?: string; id?: string; name?: string };
      if (!model.provider || !model.id || !model.name) {
        throw new Error("Detected model entries MUST include provider, id, and name.");
      }
      return { provider: model.provider, id: model.id, name: model.name };
    });
}

function modelLabel(model: Model): string {
  return `${model.provider}/${model.id} - ${model.name}`;
}

function pick(options: string[], title: string, ui: { select: (title: string, options: string[], settings?: { timeout?: number }) => Promise<string | undefined> }): Promise<string | undefined> {
  if (options.length === 0) {
    throw new Error("Picker MUST receive at least one option.");
  }
  return ui.select(title, options, { timeout: 0 });
}

async function chooseModel(models: Model[], title: string, ctx: { ui: { select: (title: string, options: string[], settings?: { timeout?: number }) => Promise<string | undefined>; input: (title: string, placeholder?: string) => Promise<string | undefined> } }): Promise<string | undefined> {
  while (true) {
    const query = await ctx.ui.input(`${title} filter`, "Type provider/id/name substring; leave empty for all");
    if (query === undefined) {
      return undefined;
    }
    const q = query.trim().toLowerCase();
    const filtered = q.length === 0
      ? models
      : models.filter((model) => `${model.provider}/${model.id} ${model.name}`.toLowerCase().includes(q));
    if (filtered.length === 0) {
      const again = await pick(["Try again", "Cancel"], `${title}\nNo models matched`, ctx.ui);
      if (again !== "Try again") {
        return undefined;
      }
      continue;
    }
    const limited = filtered.slice(0, 20).map((model) => modelLabel(model));
    const options = ["Default (inherit current)", ...limited];
    const refine = `Refine filter (${String(filtered.length)} matches)`;
    if (filtered.length > 20) {
      options.push(refine);
    }
    const picked = await pick(options, title, ctx.ui);
    if (!picked) {
      return undefined;
    }
    if (picked === refine) {
      continue;
    }
    if (picked === "Default (inherit current)") {
      return "";
    }
    const slash = picked.indexOf(" - ");
    if (slash === -1) {
      throw new Error("Model selection MUST include provider/id.");
    }
    return picked.slice(0, slash);
  }
}

async function configure(ctx: { cwd: string; ui: { select: (title: string, options: string[], settings?: { timeout?: number }) => Promise<string | undefined>; input: (title: string, placeholder?: string) => Promise<string | undefined>; notify: (text: string, level: "info" | "warning" | "error") => void } }): Promise<void> {
  const models = detect(ctx);
  if (models.length === 0) {
    throw new Error("Model setup MUST detect at least one model from Pi.");
  }

  const config = load(ctx.cwd);

  while (true) {
    const options = tasks.map((task) => {
      const current = config.models[task.id] ? ` (${config.models[task.id]})` : " (default)";
      const effort = config.thinking[task.id] ? ` | thinking=${config.thinking[task.id]}` : " | thinking=default";
      return `${task.title}${current}${effort}`;
    });
    options.push("Done");
    const picked = await pick(options, "Repo setup", ctx.ui);
    if (!picked || picked === "Done") {
      save(ctx.cwd, config);
      ctx.ui.notify("Repo setup saved.", "info");
      return;
    }

    const index = options.indexOf(picked);
    const task = tasks[index];
    if (!task) {
      throw new Error("Setup selection MUST map to a known task.");
    }

    const model = await chooseModel(models, `Model for ${task.title}`, ctx);
    if (model === undefined) {
      continue;
    }
    if (model === "") {
      delete config.models[task.id];
      continue;
    }
    config.models[task.id] = model;

    const levels = ["default", "minimal", "low", "medium", "high", "xhigh"];
    const current = config.thinking[task.id] ?? "default";
    const picks = levels.map((level) => (level === current ? `${level} (current)` : level));
    const effortPick = await pick(picks, `Thinking variant for ${task.title}`, ctx.ui);
    if (!effortPick) {
      continue;
    }
    const effort = effortPick.replace(" (current)", "");
    if (effort === "default") {
      delete config.thinking[task.id];
      continue;
    }
    config.thinking[task.id] = effort;
  }
}

function run(task: Task, model: string | undefined, effort: string | undefined, cwd: string): Promise<void> {
  const head = effort ? `Execution requirement: You MUST set reasoning effort to '${effort}' if supported before doing the task.\n\n` : "";
  const args = ["-p", `${head}${task.prompt}`];
  if (model) {
    args.unshift(model);
    args.unshift("--model");
  }
  return new Promise((resolve, reject) => {
    const proc = spawn("pi", args, {
      cwd,
      detached: false,
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    });

    proc.on("error", (err) => {
      reject(new Error(`Subagent process MUST start successfully: ${String(err.message)}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Subagent process MUST exit with code 0. Received: ${String(code)}`));
    });
  });
}

export default function repo(pi: ExtensionAPI): void {
  pi.registerCommand("repo", {
    description: "This command MUST open a GUI and MAY run one repository workflow in a silent background Pi subagent.",
    handler: async (_args, ctx) => {
      const config = load(ctx.cwd);
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

      await run(task, config.models[task.id], config.thinking[task.id], ctx.cwd);
    },
  });
}
