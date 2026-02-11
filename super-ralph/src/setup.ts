import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionCommandContext, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type RalphState, RALPH_DIR } from "./types.js";
import { persistState } from "./state.js";
import { updateUI } from "./ui.js";

export async function launchRalphGui(pi: ExtensionAPI, ctx: ExtensionCommandContext, prefill: Partial<RalphState> = {}) {
    ctx.ui.notify("Super Ralph Setup", "info");
    const name = await ctx.ui.input("Loop Name:", prefill.name || "my-task");
    if (!name) return;
    const goal = await ctx.ui.input("Goal (Markdown):", prefill.prompt || "# Goal\n- [ ] Task 1");
    if (!goal) return;
    const until = await ctx.ui.input("Until condition (Bash):", prefill.untilCondition || "echo true");
    const taskFile = path.join(RALPH_DIR, name + ".md");
    const ralphDir = path.resolve(ctx.cwd, RALPH_DIR);
    if (!fs.existsSync(ralphDir)) fs.mkdirSync(ralphDir, { recursive: true });
    fs.writeFileSync(path.resolve(ctx.cwd, taskFile), goal, "utf-8");
    const state: RalphState = {
        active: true,
        name,
        taskFile,
        iteration: 1,
        maxIterations: 50,
        reflectEvery: 5,
        untilCondition: until || undefined,
        steering: [],
    };
    persistState(pi, state);
    updateUI(ctx, state);
    pi.sendUserMessage("Starting Ralph loop '" + name + "'...");
    return state;
}

