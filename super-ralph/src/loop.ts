import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type RalphState, COMPLETE_MARKER } from "./types.js";
import { persistState } from "./state.js";
import { updateUI, updateSummary } from "./ui.js";

export async function checkCondition(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  condition: string,
): Promise<boolean> {
  try {
    const result = await pi.exec("bash", ["-c", condition], { cwd: ctx.cwd });
    return result.stdout.trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

export function stopLoop(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: RalphState | null,
  reason: string,
) {
  if (!state) return;
  state.active = false;
  persistState(pi, state);
  updateUI(ctx, null);
  ctx.ui.notify(`Super Ralph stopped: ${reason}`, "info");
}

export async function triggerNextIteration(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: RalphState,
) {
  if (!state.active) return;
  if (ctx.hasPendingMessages()) return;

  if (state.maxIterations > 0 && state.iteration >= state.maxIterations) {
    stopLoop(pi, ctx, state, "Max iterations reached.");
    return;
  }

  if (state.untilCondition) {
    const shouldContinue = await checkCondition(pi, ctx, state.untilCondition);
    if (!shouldContinue) {
      stopLoop(pi, ctx, state, "Condition met.");
      return;
    }
  }

  state.iteration++;
  persistState(pi, state);
  updateUI(ctx, state);
  void updateSummary(pi, ctx, state);

  const taskContent = fs.readFileSync(path.resolve(ctx.cwd, state.taskFile), "utf-8");
  const isReflection = state.reflectEvery > 0 && state.iteration % state.reflectEvery === 0;

  let prompt =
    "RALPH ITERATION " + state.iteration + (isReflection ? " | REFLECTION" : "") + "\n\n";
  prompt += "## Current Task (from " + state.taskFile + ")\n\n" + taskContent + "\n";

  if (isReflection) {
    prompt += "\n---\n## Reflection Turn\n";
    prompt +=
      "Pause and reflect on your progress so far. Update the checklist and notes in " +
      state.taskFile +
      ".\n";
  }

  if (state.steering.length > 0) {
    prompt +=
      "\n---\n## User Steering (NEW)\n" + state.steering.map((s) => "- " + s).join("\n") + "\n";
    state.steering = [];
  }

  prompt += "\n---\n## Instructions\n";
  prompt += "1. Work on the next items.\n";
  prompt += "2. Update " + state.taskFile + " with progress.\n";
  prompt += "3. Respond with " + COMPLETE_MARKER + " when done.\n";
  prompt += "4. Otherwise, I will auto-trigger next turn.\n";

  pi.sendMessage(
    {
      customType: "ralph-iteration",
      content: prompt,
      display: true,
    },
    {
      deliverAs: "followUp",
      triggerTurn: true,
    },
  );
}
