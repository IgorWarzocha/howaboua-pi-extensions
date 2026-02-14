import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { formatTodoList } from "./format.js";
import { getTodosDir, listTodos } from "./file-io.js";
import { getTodoCompletions } from "./command/completions.js";
import { runTodoUi } from "./command/ui.js";

export function registerTodoCommand(pi: ExtensionAPI) {
  pi.registerCommand("todo", {
    description: "List todos from .pi/todos",
    getArgumentCompletions: (argumentPrefix: string) => getTodoCompletions(argumentPrefix),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const todos = await listTodos(getTodosDir(ctx.cwd));
      if (!ctx.hasUI) {
        process.stdout.write(`${formatTodoList(todos)}\n`);
        return;
      }
      const nextPrompt = await runTodoUi(args, ctx);
      if (nextPrompt) pi.sendUserMessage(nextPrompt);
    },
  });
}
