import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { ChecklistItem, TodoRecord } from "../types.js";
import { appendTodoBody, claimTodoAssignment, ensureTodoExists, ensureTodosDir, generateTodoId, getTodoPath, listTodos, releaseTodoAssignment, writeTodoFile } from "../file-io.js";
import { formatTodoId, formatTickResult, serializeTodoForAgent, serializeTodoListForAgent, splitTodosByAssignment } from "../format.js";
import { deriveTodoStatus } from "../format.js";
import { validateTodoId } from "../parser.js";

function error(action: string, message: string, extra: Record<string, unknown> = {}) {
    return { content: [{ type: "text" as const, text: message }], details: { action, error: message.replace(/^Error: /, ""), ...extra } };
}

export async function runListAction(todosDir: string, ctx: ExtensionCommandContext) {
    const todos = await listTodos(todosDir);
    const split = splitTodosByAssignment(todos);
    const listedTodos = [...split.assignedTodos, ...split.openTodos];
    return { content: [{ type: "text" as const, text: serializeTodoListForAgent(listedTodos) }], details: { action: "list", todos: listedTodos, currentSessionId: ctx.sessionManager.getSessionId() } };
}

export async function runListAllAction(todosDir: string, ctx: ExtensionCommandContext) {
    const todos = await listTodos(todosDir);
    return { content: [{ type: "text" as const, text: serializeTodoListForAgent(todos) }], details: { action: "list-all", todos, currentSessionId: ctx.sessionManager.getSessionId() } };
}

export async function runGetAction(todosDir: string, params: { id?: string }) {
    if (!params.id) return error("get", "Error: id required");
    const validated = validateTodoId(params.id);
    if ("error" in validated) return error("get", validated.error);
    const todo = await ensureTodoExists(getTodoPath(todosDir, validated.id), validated.id);
    if (!todo) return error("get", `Todo ${formatTodoId(validated.id)} not found`);
    return { content: [{ type: "text" as const, text: serializeTodoForAgent(todo) }], details: { action: "get", todo } };
}

export async function runCreateAction(todosDir: string, params: { title?: string; tags?: string[]; body?: string; checklist?: ChecklistItem[] }) {
    if (!params.title) return error("create", "Error: title required");
    if (!params.checklist?.length) return error("create", "Error: checklist required for create action");
    await ensureTodosDir(todosDir);
    const id = await generateTodoId(todosDir);
    const todo: TodoRecord = { id, title: params.title, tags: params.tags ?? [], status: "open", created_at: new Date().toISOString(), body: params.body ?? "", checklist: params.checklist.map(item => ({ id: item.id, title: item.title, status: item.status ?? "unchecked" })) };
    todo.status = deriveTodoStatus(todo);
    await writeTodoFile(getTodoPath(todosDir, id), todo);
    return { content: [{ type: "text" as const, text: serializeTodoForAgent(todo) }], details: { action: "create", todo } };
}

export async function runUpdateAction(todosDir: string, params: { id?: string; title?: string; status?: string; tags?: string[]; body?: string; checklist?: ChecklistItem[] }) {
    if (!params.id) return error("update", "Error: id required");
    const validated = validateTodoId(params.id);
    if ("error" in validated) return error("update", validated.error);
    const filePath = getTodoPath(todosDir, validated.id);
    const existing = await ensureTodoExists(filePath, validated.id);
    if (!existing) return error("update", `Todo ${formatTodoId(validated.id)} not found`);
    if (params.status !== undefined) return error("update", "Error: status updates are user-only. Use tick for checklist progress.");
    if (params.title !== undefined) existing.title = params.title;
    if (params.tags !== undefined) existing.tags = params.tags;
    if (params.body !== undefined) existing.body = params.body;
    if (params.checklist !== undefined) {
        if (!params.checklist.length) return error("update", "Error: checklist MUST NOT be empty");
        existing.checklist = params.checklist.map(item => ({ id: item.id, title: item.title, status: item.status ?? "unchecked" }));
        existing.status = deriveTodoStatus(existing);
    }
    if (!existing.created_at) existing.created_at = new Date().toISOString();
    await writeTodoFile(filePath, existing);
    return { content: [{ type: "text" as const, text: serializeTodoForAgent(existing) }], details: { action: "update", todo: existing } };
}

export async function runAppendAction(todosDir: string, params: { id?: string; body?: string }) {
    if (!params.id) return error("append", "Error: id required");
    const validated = validateTodoId(params.id);
    if ("error" in validated) return error("append", validated.error);
    const filePath = getTodoPath(todosDir, validated.id);
    const existing = await ensureTodoExists(filePath, validated.id);
    if (!existing) return error("append", `Todo ${formatTodoId(validated.id)} not found`);
    if (!params.body || !params.body.trim()) return { content: [{ type: "text" as const, text: serializeTodoForAgent(existing) }], details: { action: "append", todo: existing } };
    const updated = await appendTodoBody(filePath, existing, params.body);
    return { content: [{ type: "text" as const, text: serializeTodoForAgent(updated) }], details: { action: "append", todo: updated } };
}

export async function runClaimAction(todosDir: string, params: { id?: string; force?: boolean }, ctx: ExtensionCommandContext) {
    if (!params.id) return error("claim", "Error: id required");
    const result = await claimTodoAssignment(todosDir, params.id, ctx, Boolean(params.force));
    if ("error" in result) return error("claim", result.error);
    return { content: [{ type: "text" as const, text: serializeTodoForAgent(result) }], details: { action: "claim", todo: result } };
}

export async function runReleaseAction(todosDir: string, params: { id?: string; force?: boolean }, ctx: ExtensionCommandContext) {
    if (!params.id) return error("release", "Error: id required");
    const result = await releaseTodoAssignment(todosDir, params.id, ctx, Boolean(params.force));
    if ("error" in result) return error("release", result.error);
    return { content: [{ type: "text" as const, text: serializeTodoForAgent(result) }], details: { action: "release", todo: result } };
}

export async function runTickAction(todosDir: string, params: { id?: string; item?: string }) {
    if (!params.id) return error("tick", "Error: id required", { todo: undefined as never, remaining: [], allComplete: false });
    if (!params.item) return error("tick", "Error: item required for tick action", { todo: undefined as never, remaining: [], allComplete: false });
    const validated = validateTodoId(params.id);
    if ("error" in validated) return error("tick", validated.error, { todo: undefined as never, remaining: [], allComplete: false });
    const filePath = getTodoPath(todosDir, validated.id);
    const existing = await ensureTodoExists(filePath, validated.id);
    if (!existing) return error("tick", `Todo ${formatTodoId(validated.id)} not found`, { todo: undefined as never, remaining: [], allComplete: false });
    if (!existing.checklist?.length) return error("tick", `Error: Todo ${formatTodoId(validated.id)} has no checklist. Use update action to add one.`, { todo: existing, remaining: [], allComplete: false });
    const index = existing.checklist.findIndex(i => i.id === params.item);
    if (index === -1) return error("tick", `Error: Checklist item "${params.item}" not found in todo ${formatTodoId(validated.id)}`, { todo: existing, remaining: [], allComplete: false });
    const item = existing.checklist[index];
    item.status = item.status === "checked" ? "unchecked" : "checked";
    existing.status = deriveTodoStatus(existing);
    await writeTodoFile(filePath, existing);
    const remaining = existing.checklist.filter(i => i.status === "unchecked");
    const allComplete = remaining.length === 0;
    const tickedItem = item.status === "checked" ? item : undefined;
    return { content: [{ type: "text" as const, text: formatTickResult(existing, tickedItem, remaining, allComplete) }], details: { action: "tick", todo: existing, tickedItem, remaining, allComplete } };
}
