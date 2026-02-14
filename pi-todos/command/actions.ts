import fs from "node:fs";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoQuickAction, TodoRecord } from "../types.js";
import { resolveLinkedPaths } from "../format.js";
import {
  deleteTodo,
  releaseTodoAssignment,
  reopenTodoForUser,
  updateTodoStatus,
} from "../file-io.js";
import { ensureWorktree } from "../worktree.js";
import * as flow from "../gui/actions.js";

function validateLinks(record: TodoFrontMatter): { ok: true } | { error: string } {
  if (!record.links) return { ok: true };
  const root = record.links.root_abs || "";
  const paths = resolveLinkedPaths(record.links);
  if (paths.length && !root) return { error: "links.root_abs is required when links contain repo-relative files." };
  for (const item of paths) {
    if (!fs.existsSync(item)) return { error: `Required linked file not found: ${item}` };
  }
  return { ok: true };
}

async function runWork(
  record: TodoFrontMatter,
  ctx: ExtensionCommandContext,
  done: () => void,
  setPrompt: (value: string) => void,
): Promise<"stay" | "exit"> {
  const links = validateLinks(record);
  if ("error" in links) {
    ctx.ui.notify(links.error, "error");
    return "stay";
  }
  const worktree = await ensureWorktree(record, ctx);
  if ("error" in worktree) {
    ctx.ui.notify(worktree.error, "error");
    return "stay";
  }
  if ("path" in worktree && worktree.created) ctx.ui.notify(`Created worktree ${worktree.path}`, "info");
  setPrompt(flow.work(record));
  done();
  return "exit";
}

export async function applyTodoAction(
  todosDir: string,
  ctx: ExtensionCommandContext,
  refresh: () => Promise<void>,
  done: () => void,
  record: TodoRecord,
  action: TodoMenuAction,
  setPrompt: (value: string) => void,
): Promise<"stay" | "exit"> {
  if (action === "refine") {
    setPrompt(flow.refine(record));
    done();
    return "exit";
  }
  if (action === "work") return runWork(record, ctx, done, setPrompt);
  if (action === "review-item") {
    const links = validateLinks(record);
    if ("error" in links) {
      ctx.ui.notify(links.error, "error");
      return "stay";
    }
    setPrompt(flow.review(record));
    done();
    return "exit";
  }
  if (action === "view") return "stay";
  if (action === "release") {
    const result = await releaseTodoAssignment(todosDir, record.id, ctx, true);
    if ("error" in result) {
      ctx.ui.notify(result.error, "error");
      return "stay";
    }
    await refresh();
    ctx.ui.notify(flow.released(record), "info");
    return "stay";
  }
  if (action === "delete") {
    const removed = await deleteTodo(todosDir, record.id, ctx);
    if ("error" in removed) {
      ctx.ui.notify(removed.error, "error");
      return "stay";
    }
    await refresh();
    ctx.ui.notify(flow.deleted(record), "info");
    return "stay";
  }
  if (action === "reopen") {
    const reopened = await reopenTodoForUser(todosDir, record.id, ctx);
    if ("error" in reopened) {
      ctx.ui.notify(reopened.error, "error");
      return "stay";
    }
    await refresh();
    ctx.ui.notify(flow.reopened(record), "info");
    return "stay";
  }
  const status = action === "complete" ? "done" : "abandoned";
  const updated = await updateTodoStatus(todosDir, record.id, status, ctx);
  if ("error" in updated) {
    ctx.ui.notify(updated.error, "error");
    return "stay";
  }
  await refresh();
  ctx.ui.notify(
    flow.done(action === "complete" ? "complete" : "abandon", record),
    "info",
  );
  return "stay";
}

export async function handleQuickAction(
  todo: TodoFrontMatter | null,
  action: TodoQuickAction,
  showCreateInput: () => void,
  done: () => void,
  setPrompt: (value: string) => void,
  ctx: ExtensionCommandContext,
  resolve: (todo: TodoFrontMatter) => Promise<TodoRecord | null>,
): Promise<void> {
  if (action === "create") return showCreateInput();
  if (!todo) return;
  if (action === "refine") {
    setPrompt(flow.refine(todo));
    done();
    return;
  }
  if (action === "work") {
    const record = await resolve(todo);
    if (!record) return;
    await runWork(record, ctx, done, setPrompt);
    return;
  }
}
