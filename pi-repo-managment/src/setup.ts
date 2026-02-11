import { load, save } from "./config.js";
import { choose, detect } from "./models.js";
import { tasks } from "./tasks/index.js";
import type { Ui } from "./types.js";
import { pick } from "./ui.js";

export async function configure(ctx: { cwd: string; ui: Ui }): Promise<void> {
  const list = detect(ctx);
  if (list.length === 0) {
    throw new Error("Model setup MUST detect at least one model from Pi.");
  }
  const conf = load();
  while (true) {
    const rows = tasks.map((task) => {
      const model = conf.models[task.id] ? ` (${conf.models[task.id]})` : " (default)";
      const think = conf.thinking[task.id]
        ? ` | thinking=${conf.thinking[task.id]}`
        : " | thinking=default";
      return `${task.title}${model}${think}`;
    });
    rows.push("Done");
    const picked = await pick(rows, "Repo setup", ctx.ui);
    if (!picked || picked === "Done") {
      save(conf);
      ctx.ui.notify("Repo setup saved.", "info");
      return;
    }
    const at = rows.indexOf(picked);
    const task = tasks[at];
    if (!task) {
      throw new Error("Setup selection MUST map to a known task.");
    }
    const model = await choose(list, `Model for ${task.title}`, ctx.ui);
    if (model === undefined) {
      continue;
    }
    if (model === "") {
      delete conf.models[task.id];
    } else {
      conf.models[task.id] = model;
    }
    const levels = ["default", "off", "minimal", "low", "medium", "high", "xhigh"];
    const cur = conf.thinking[task.id] ?? "default";
    const opts = levels.map((item) => (item === cur ? `${item} (current)` : item));
    const effort = await pick(opts, `Thinking variant for ${task.title}`, ctx.ui);
    if (!effort) {
      continue;
    }
    const next = effort.replace(" (current)", "");
    if (next === "default") {
      delete conf.thinking[task.id];
      continue;
    }
    conf.thinking[task.id] = next;
  }
}
