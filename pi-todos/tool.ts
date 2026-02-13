import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getTodosDirLabel } from "./file-io.js";
import { TodoParams } from "./tool/schema.js";
import { runToolExecute } from "./tool/execute.js";
import { renderToolCall, renderToolResult } from "./tool/render.js";

export function registerTodoTool(pi: ExtensionAPI) {
  const todosDirLabel = getTodosDirLabel(process.cwd());
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      `Manage file-based todos in ${todosDirLabel}. ` +
      "Actions: list, list-all, get, create, update, append, claim, release, tick. " +
      "Title is the short summary; body is long-form markdown notes. " +
      "Use 'create' with a non-empty checklist, 'update' to replace body content, 'append' to add to it, and 'tick' to check off checklist items. " +
      "Todo ids are internal references; title MAY be used for lookup when id is omitted. " +
      "You MUST claim tasks before working on them to avoid conflicts. " +
      "When a todo has a checklist, use 'tick' to check off checklist items. Status is derived from checklist completion. " +
      "You SHOULD close todos when complete.",
    parameters: TodoParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return runToolExecute(params as never, ctx as never);
    },
    renderCall(args, theme) {
      return renderToolCall(args as never, theme as never);
    },
    renderResult(result, state, theme) {
      return renderToolResult(result as never, state as never, theme as never);
    },
  });
}
