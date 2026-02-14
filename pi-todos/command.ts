import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getTodosDir } from "./file-io.js";
import { getTodoCompletions } from "./command/completions.js";
import { blockedResponse, parseInternalArgs, runInternal } from "./command/internal.js";
import { runTodoUi } from "./command/ui.js";

export function registerTodoCommand(pi: ExtensionAPI) {
  pi.registerCommand("todo", {
    description: "List plan items from .pi/plans",
    getArgumentCompletions: (argumentPrefix: string) => getTodoCompletions(argumentPrefix),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = (args || "").trim();
      if (trimmed.startsWith("--internal")) {
        try {
          const payload = parseInternalArgs(trimmed);
          if (!payload) {
            process.stdout.write(`${blockedResponse()}\n`);
            return;
          }
          process.stdout.write(`${await runInternal(payload, ctx)}\n`);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "invalid internal payload";
          process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
          return;
        }
      }
      if (!ctx.hasUI) {
        process.stdout.write(`${blockedResponse()}\n`);
        return;
      }
      const nextPrompt = await runTodoUi(args, ctx);
      if (nextPrompt) pi.sendUserMessage(nextPrompt);
    },
  });
}
