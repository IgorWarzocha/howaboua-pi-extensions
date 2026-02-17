import fs from "node:fs";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoQuickAction, TodoRecord } from "../types.js";
import { resolveLinkedPaths } from "../format.js";
import {
  claimTodoAssignment,
  deleteTodo,
  getTodoPath,
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
  const hasRelative = paths.some(p => !p.startsWith("/"));
  if (hasRelative && !root) return { error: "links.root_abs is required when links contain repo-relative files." };
  for (const item of paths) {
    if (!fs.existsSync(item)) return { error: `Required linked file not found: ${item}` };
  }
  return { ok: true };
}

async function runWork(
  todosDir: string,
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
  try {
    const worktree = await ensureWorktree(record, ctx);
    if ("path" in worktree && worktree.created) ctx.ui.notify(`Created worktree ${worktree.path}`, "info");
  } catch (e: any) {
    ctx.ui.notify(`Worktree setup failed: ${e.message}`, "error");
    return "stay";
  }
  const filePath = getTodoPath(todosDir, record.id, record.type || record.kind);
  setPrompt(flow.work(record, filePath));
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
    const filePath = getTodoPath(todosDir, record.id, record.type || record.kind);
    setPrompt(flow.refine(record, filePath));
    done();
    return "exit";
  }
  if (action === "work") return runWork(todosDir, record, ctx, done, setPrompt);
  if (action === "review-item") {
    const links = validateLinks(record);
    if ("error" in links) {
      ctx.ui.notify(links.error, "error");
      return "stay";
    }
    const filePath = getTodoPath(todosDir, record.id, record.type || record.kind);
    setPrompt(flow.review(record, filePath));
    done();
    return "exit";
  }
  if (action === "view") return "stay";
  if (action === "attach-links") return "stay";
  if (action === "validate-links") return "stay";
  if (action === "audit") return "stay";
  if (action === "assign") {
    const result = await claimTodoAssignment(todosDir, record.id, ctx, false);
    if ("error" in result) {
      ctx.ui.notify(result.error, "error");
      return "stay";
    }
    await refresh();
    ctx.ui.notify(flow.assigned(record), "info");
    return "stay";
  }
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
  if (action === "go-to-session") {
    const sessionPath = record.assigned_to_session_file;
    if (!sessionPath) {
      ctx.ui.notify("No assigned session path stored on this item.", "error");
      return "stay";
    }
    const anyCtx = ctx as unknown as { switchSession?: (path: string) => Promise<{ cancelled: boolean }> };
    if (!anyCtx.switchSession) {
      ctx.ui.notify("Session switching is unavailable in this runtime. Use /resume.", "error");
      return "stay";
    }
    const result = await anyCtx.switchSession(sessionPath);
    if (result.cancelled) {
      ctx.ui.notify("Session switch cancelled.", "error");
      return "stay";
    }
    done();
    return "exit";
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
  todosDir: string,
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
    const filePath = getTodoPath(todosDir, todo.id, todo.type || todo.kind);
    setPrompt(flow.refine(todo, filePath));
    done();
    return;
  }
  if (action === "work") {
    const record = await resolve(todo);
    if (!record) return;
    await runWork(todosDir, record, ctx, done, setPrompt);
    return;
  }
}

