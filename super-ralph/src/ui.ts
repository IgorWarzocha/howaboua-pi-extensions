import * as fs from "node:fs";
import * as path from "node:path";
import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type RalphState, SUMMARY_SYSTEM_PROMPT } from "./types.js";
import { persistState } from "./state.js";

export function updateUI(ctx: ExtensionContext, state: RalphState | null): void {
    if (!ctx.hasUI) return;
    if (!state || !state.active) {
        ctx.ui.setStatus("ralph", undefined);
        ctx.ui.setWidget("ralph", undefined);
        return;
    }

    const { theme } = ctx.ui;
    const iterText = `(${state.iteration}${state.maxIterations > 0 ? `/${state.maxIterations}` : ""})`;
    const statusText = state.summary ? `Ralph ${state.name}: ${state.summary} ${iterText}` : `Ralph ${state.name} ${iterText}`;
    ctx.ui.setStatus("ralph", theme.fg("accent", statusText));

    const lines = [
        theme.fg("accent", theme.bold("Super Ralph Loop")),
        theme.fg("muted", `Name: ${state.name}`),
        theme.fg("dim", `Iteration: ${state.iteration}`),
        theme.fg("dim", `Task File: ${state.taskFile}`),
    ];
    if (state.untilCondition) {
        lines.push(theme.fg("dim", `Until: ${state.untilCondition}`));
    }
    lines.push("");
    lines.push(theme.fg("warning", "ESC pauses loop; /ralph-stop ends it."));
    ctx.ui.setWidget("ralph", lines);
}

export async function updateSummary(pi: ExtensionAPI, ctx: ExtensionContext, state: RalphState) {
    if (!ctx.model) return;
    const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
    if (!apiKey) return;

    const taskContent = fs.readFileSync(path.resolve(ctx.cwd, state.taskFile), "utf-8");
    const userMessage: UserMessage = {
        role: "user",
        content: [{ type: "text", text: `Iteration ${state.iteration} content:\n${taskContent}` }],
        timestamp: Date.now(),
    };

    try {
        const response = await complete(ctx.model, { systemPrompt: SUMMARY_SYSTEM_PROMPT, messages: [userMessage] }, { apiKey });
        const text = (response.content[0] as any)?.text?.trim();
        if (text) {
            state.summary = text;
            persistState(pi, state);
            updateUI(ctx, state);
        }
    } catch { /* ignore */ }
}
