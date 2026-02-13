import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ChecklistItem, TodoRecord } from "../types.js";
import {
  appendTodoBody,
  claimTodoAssignment,
  ensureTodoExists,
  ensureTodosDir,
  generateTodoId,
  getTodoPath,
  listTodos,
  releaseTodoAssignment,
  writeTodoFile,
} from "../file-io.js";
import {
  deriveTodoStatus,
  formatTickResult,
  serializeTodoForAgent,
  serializeTodoListForAgent,
  splitTodosByAssignment,
} from "../format.js";
import { withTodoLock } from "../lock.js";
import { validateTodoId } from "../parser.js";

function error(action: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: { action, error: message.replace(/^Error: /, ""), ...extra },
  };
}

async function resolveTodoRef(
  todosDir: string,
  params: { id?: string; title?: string },
): Promise<{ id: string; filePath: string; todo: TodoRecord } | { error: string }> {
  if (params.id) {
    const validated = validateTodoId(params.id);
    if ("error" in validated) return { error: validated.error };
    const filePath = getTodoPath(todosDir, validated.id);
    const todo = await ensureTodoExists(filePath, validated.id);
    if (!todo) return { error: "Todo not found" };
    return { id: validated.id, filePath, todo };
  }
  if (!params.title) return { error: "Error: id or title required" };
  const todos = await listTodos(todosDir);
  const matches = todos.filter((todo) => todo.title === params.title);
  if (!matches.length) return { error: "Todo not found" };
  if (matches.length > 1)
    return { error: "Error: multiple todos share this title. Rename one todo first." };
  const id = matches[0].id;
  const filePath = getTodoPath(todosDir, id);
  const todo = await ensureTodoExists(filePath, id);
  if (!todo) return { error: "Todo not found" };
  return { id, filePath, todo };
}

function ensureAssignedToCurrentSession(todo: TodoRecord, ctx: ExtensionContext): string | null {
  if (!todo.assigned_to_session) return null;
  const sessionId = ctx.sessionManager.getSessionId();
  if (todo.assigned_to_session === sessionId) return null;
  return `Error: todo is assigned to session ${todo.assigned_to_session}. Claim with force to modify.`;
}

export async function runListAction(todosDir: string, ctx: ExtensionContext) {
  const todos = await listTodos(todosDir);
  const split = splitTodosByAssignment(todos);
  const listedTodos = [...split.assignedTodos, ...split.openTodos];
  return {
    content: [{ type: "text" as const, text: serializeTodoListForAgent(listedTodos) }],
    details: {
      action: "list",
      todos: listedTodos,
      currentSessionId: ctx.sessionManager.getSessionId(),
    },
  };
}

export async function runListAllAction(todosDir: string, ctx: ExtensionContext) {
  const todos = await listTodos(todosDir);
  return {
    content: [{ type: "text" as const, text: serializeTodoListForAgent(todos) }],
    details: { action: "list-all", todos, currentSessionId: ctx.sessionManager.getSessionId() },
  };
}

export async function runGetAction(todosDir: string, params: { id?: string; title?: string }) {
  const resolved = await resolveTodoRef(todosDir, params);
  if ("error" in resolved) return error("get", resolved.error);
  return {
    content: [{ type: "text" as const, text: serializeTodoForAgent(resolved.todo) }],
    details: { action: "get", todo: resolved.todo },
  };
}

export async function runCreateAction(
  todosDir: string,
  params: { title?: string; tags?: string[]; body?: string; checklist?: ChecklistItem[] },
) {
  if (!params.title) return error("create", "Error: title required");
  if (!params.checklist?.length)
    return error("create", "Error: checklist required for create action");
  await ensureTodosDir(todosDir);
  const existingTodos = await listTodos(todosDir);
  if (existingTodos.some((todo) => todo.title === params.title))
    return error("create", "Error: todo title already exists. Use a unique title.");
  const id = await generateTodoId(todosDir);
  const todo: TodoRecord = {
    id,
    title: params.title,
    tags: params.tags ?? [],
    status: "open",
    created_at: new Date().toISOString(),
    body: params.body ?? "",
    checklist: params.checklist.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status ?? "unchecked",
    })),
  };
  todo.status = deriveTodoStatus(todo);
  await writeTodoFile(getTodoPath(todosDir, id), todo);
  return {
    content: [{ type: "text" as const, text: serializeTodoForAgent(todo) }],
    details: { action: "create", todo },
  };
}

export async function runUpdateAction(
  todosDir: string,
  params: {
    id?: string;
    title?: string;
    status?: string;
    tags?: string[];
    body?: string;
    checklist?: ChecklistItem[];
  },
  ctx: ExtensionContext,
) {
  const resolved = await resolveTodoRef(todosDir, params);
  if ("error" in resolved) return error("update", resolved.error);
  const assignmentError = ensureAssignedToCurrentSession(resolved.todo, ctx);
  if (assignmentError) return error("update", assignmentError);
  if (params.status !== undefined)
    return error("update", "Error: status updates are user-only. Use tick for checklist progress.");
  const result = await withTodoLock(todosDir, resolved.id, ctx, async () => {
    const current = await ensureTodoExists(resolved.filePath, resolved.id);
    if (!current) return { error: "Todo not found" };
    const currentAssignmentError = ensureAssignedToCurrentSession(current, ctx);
    if (currentAssignmentError) return { error: currentAssignmentError };
    if (params.title !== undefined) {
      const todos = await listTodos(todosDir);
      const duplicate = todos.find((todo) => todo.id !== current.id && todo.title === params.title);
      if (duplicate) return { error: "Error: todo title already exists. Use a unique title." };
      current.title = params.title;
    }
    if (params.tags !== undefined) current.tags = params.tags;
    if (params.body !== undefined) current.body = params.body;
    if (params.checklist !== undefined) {
      if (!params.checklist.length) return { error: "Error: checklist MUST NOT be empty" };
      current.checklist = params.checklist.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status ?? "unchecked",
      }));
      current.status = deriveTodoStatus(current);
    }
    if (!current.created_at) current.created_at = new Date().toISOString();
    await writeTodoFile(resolved.filePath, current);
    return current;
  });
  if (typeof result === "object" && "error" in result) return error("update", result.error);
  return {
    content: [{ type: "text" as const, text: serializeTodoForAgent(result) }],
    details: { action: "update", todo: result },
  };
}

export async function runAppendAction(
  todosDir: string,
  params: { id?: string; title?: string; body?: string },
  ctx: ExtensionContext,
) {
  const resolved = await resolveTodoRef(todosDir, params);
  if ("error" in resolved) return error("append", resolved.error);
  const assignmentError = ensureAssignedToCurrentSession(resolved.todo, ctx);
  if (assignmentError) return error("append", assignmentError);
  if (!params.body || !params.body.trim())
    return {
      content: [{ type: "text" as const, text: serializeTodoForAgent(resolved.todo) }],
      details: { action: "append", todo: resolved.todo },
    };
  const body = params.body;
  const updated = await withTodoLock(todosDir, resolved.id, ctx, async () => {
    const current = await ensureTodoExists(resolved.filePath, resolved.id);
    if (!current) return { error: "Todo not found" };
    const currentAssignmentError = ensureAssignedToCurrentSession(current, ctx);
    if (currentAssignmentError) return { error: currentAssignmentError };
    return appendTodoBody(resolved.filePath, current, body);
  });
  if (typeof updated === "object" && "error" in updated)
    return error("append", updated.error ?? "Error: append failed");
  return {
    content: [{ type: "text" as const, text: serializeTodoForAgent(updated) }],
    details: { action: "append", todo: updated },
  };
}

export async function runClaimAction(
  todosDir: string,
  params: { id?: string; title?: string; force?: boolean },
  ctx: ExtensionContext,
) {
  const resolved = await resolveTodoRef(todosDir, params);
  if ("error" in resolved) return error("claim", resolved.error);
  const result = await claimTodoAssignment(todosDir, resolved.id, ctx, Boolean(params.force));
  if ("error" in result) return error("claim", result.error);
  return {
    content: [{ type: "text" as const, text: serializeTodoForAgent(result) }],
    details: { action: "claim", todo: result },
  };
}

export async function runReleaseAction(
  todosDir: string,
  params: { id?: string; title?: string; force?: boolean },
  ctx: ExtensionContext,
) {
  const resolved = await resolveTodoRef(todosDir, params);
  if ("error" in resolved) return error("release", resolved.error);
  const result = await releaseTodoAssignment(todosDir, resolved.id, ctx, Boolean(params.force));
  if ("error" in result) return error("release", result.error);
  return {
    content: [{ type: "text" as const, text: serializeTodoForAgent(result) }],
    details: { action: "release", todo: result },
  };
}

export async function runTickAction(
  todosDir: string,
  params: { id?: string; title?: string; item?: string },
  ctx: ExtensionContext,
) {
  const resolved = await resolveTodoRef(todosDir, params);
  if ("error" in resolved)
    return error("tick", resolved.error, {
      todo: undefined as never,
      remaining: [],
      allComplete: false,
    });
  if (!params.item)
    return error("tick", "Error: item required for tick action", {
      todo: undefined as never,
      remaining: [],
      allComplete: false,
    });
  const existing = resolved.todo;
  const assignmentError = ensureAssignedToCurrentSession(existing, ctx);
  if (assignmentError)
    return error("tick", assignmentError, {
      todo: existing,
      remaining: [],
      allComplete: false,
    });
  if (!existing.checklist?.length)
    return error("tick", "Error: Todo has no checklist. Use update action to add one.", {
      todo: existing,
      remaining: [],
      allComplete: false,
    });
  const index = existing.checklist.findIndex((i) => i.id === params.item);
  if (index === -1)
    return error("tick", `Error: Checklist item "${params.item}" not found in todo`, {
      todo: existing,
      remaining: [],
      allComplete: false,
    });
  const updated = await withTodoLock(todosDir, resolved.id, ctx, async () => {
    const current = await ensureTodoExists(resolved.filePath, resolved.id);
    if (!current) return { error: "Todo not found" };
    const currentAssignmentError = ensureAssignedToCurrentSession(current, ctx);
    if (currentAssignmentError) return { error: currentAssignmentError };
    if (!current.checklist?.length)
      return { error: "Error: Todo has no checklist. Use update action to add one." };
    const currentIndex = current.checklist.findIndex((i) => i.id === params.item);
    if (currentIndex === -1)
      return { error: `Error: Checklist item "${params.item}" not found in todo` };
    const item = current.checklist[currentIndex];
    item.status = item.status === "checked" ? "unchecked" : "checked";
    current.status = deriveTodoStatus(current);
    await writeTodoFile(resolved.filePath, current);
    return { todo: current, item };
  });
  if (typeof updated === "object" && "error" in updated)
    return error("tick", updated.error ?? "Error: tick failed", {
      todo: existing,
      remaining: [],
      allComplete: false,
    });
  const checklist = updated.todo.checklist ?? [];
  const remaining = checklist.filter((i) => i.status === "unchecked");
  const allComplete = remaining.length === 0;
  const tickedItem = updated.item.status === "checked" ? updated.item : undefined;
  return {
    content: [
      {
        type: "text" as const,
        text: formatTickResult(updated.todo, tickedItem, remaining, allComplete),
      },
    ],
    details: { action: "tick", todo: updated.todo, tickedItem, remaining, allComplete },
  };
}
