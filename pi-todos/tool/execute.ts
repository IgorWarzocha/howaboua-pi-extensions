import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TodoAction, TodoToolDetails } from "../types.js";
import { getTodosDir } from "../file-io.js";
import {
  runListAction,
  runListAllAction,
  runGetAction,
  runCreateAction,
  runUpdateAction,
  runAppendAction,
  runClaimAction,
  runReleaseAction,
  runTickAction,
} from "./execute-actions.js";

export async function runToolExecute(params: Record<string, unknown>, ctx: ExtensionContext) {
  if (params.internal !== true) {
    const message =
      "Error: Direct todo tool invocation is blocked. Use /todo GUI actions. Internal execution MUST set internal=true and is reserved for extension-managed calls.";
    const details: TodoToolDetails = { action: "list", todos: [], error: message.replace(/^Error: /, "") };
    return { content: [{ type: "text" as const, text: message }], details };
  }
  const todosDir = getTodosDir(ctx.cwd);
  const action = params.action as TodoAction;
  if (action === "list") return runListAction(todosDir, ctx);
  if (action === "list-all") return runListAllAction(todosDir, ctx);
  if (action === "get") return runGetAction(todosDir, params as never);
  if (action === "create") return runCreateAction(todosDir, params as never);
  if (action === "update") return runUpdateAction(todosDir, params as never, ctx);
  if (action === "append") return runAppendAction(todosDir, params as never, ctx);
  if (action === "claim") return runClaimAction(todosDir, params as never, ctx);
  if (action === "release") return runReleaseAction(todosDir, params as never, ctx);
  if (action === "tick") return runTickAction(todosDir, params as never, ctx);
  const details: TodoToolDetails = { action: "list", todos: [], error: "unsupported action" };
  return { content: [{ type: "text" as const, text: "Error: unsupported action" }], details };
}
