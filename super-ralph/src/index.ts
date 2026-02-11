import type { ExtensionAPI, SessionSwitchEvent } from "@mariozechner/pi-coding-agent";
import { COMPLETE_MARKER, type RalphState } from "./types.js";
import { loadState, persistState } from "./state.js";
import { updateUI } from "./ui.js";
import { triggerNextIteration, stopLoop } from "./loop.js";
import { launchRalphGui } from "./setup.js";

export default function (pi: ExtensionAPI) {
  let ralphState: RalphState | null = null;

  pi.registerCommand("ralph", {
    description: "Super Ralph launcher",
    handler: async (args, ctx) => {
      const tokens = args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const prefill: any = {};
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i].replace(/^"|"$/g, "");
        if (tok === "--until" && tokens[i + 1]) {
          prefill.untilCondition = tokens[++i].replace(/^"|"$/g, "");
        } else if (tok === "--prompt" && tokens[i + 1]) {
          prefill.taskFile = tokens[++i].replace(/^"|"$/g, "");
        } else if (!tok.startsWith("--")) {
          prefill.prompt = tok;
        }
      }
      ralphState = (await launchRalphGui(pi, ctx, prefill)) || ralphState;
    },
  });

  pi.registerCommand("ralph-stop", {
    description: "Stop Super Ralph loop",
    handler: async (_args, ctx) => stopLoop(pi, ctx, ralphState, "Manual stop."),
  });

  pi.registerCommand("ralph-steer", {
    description: "Inject steering instructions",
    handler: async (args, ctx) => {
      if (!ralphState || !ralphState.active) {
        ctx.ui.notify("No active Ralph loop to steer.", "warning");
        return;
      }
      const message = args.trim();
      if (!message) {
        const input = await ctx.ui.input("Steer Ralph:", "Add guidance for next iterations");
        if (!input) return;
        ralphState.steering.push(input.trim());
      } else {
        ralphState.steering.push(message);
      }
      persistState(pi, ralphState);
      ctx.ui.notify("Steering message queued.", "info");
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!ralphState || !ralphState.active) return;
    const lastMsg = [...event.messages].reverse().find((m) => m.role === "assistant");
    const text =
      lastMsg && Array.isArray(lastMsg.content)
        ? lastMsg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join(" ")
        : "";
    if (text.includes(COMPLETE_MARKER)) {
      stopLoop(pi, ctx, ralphState, "Completion marker detected.");
      return;
    }
    await triggerNextIteration(pi, ctx, ralphState);
  });

  pi.on("session_start", async (_event, ctx) => {
    ralphState = loadState(ctx);
    updateUI(ctx, ralphState);
  });

  pi.on("session_switch", async (_event: SessionSwitchEvent, ctx) => {
    ralphState = loadState(ctx);
    updateUI(ctx, ralphState);
  });
}
