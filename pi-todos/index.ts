import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getTodosDir, ensureTodosDir, readTodoSettings, garbageCollectTodos } from "./file-io.js";
import { registerTodoCommand } from "./command.js";

export default function todosExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const todosDir = getTodosDir(ctx.cwd);
    await ensureTodosDir(todosDir);
    const settings = await readTodoSettings(todosDir);
    await garbageCollectTodos(todosDir, settings);
  });

  registerTodoCommand(pi);
}
