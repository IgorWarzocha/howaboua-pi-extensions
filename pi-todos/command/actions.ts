import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoQuickAction, TodoRecord } from "../types.js";
import { buildRefinePrompt, formatTodoId, getTodoTitle } from "../format.js";
import { deleteTodo, releaseTodoAssignment, reopenTodoForUser, updateTodoStatus } from "../file-io.js";

export async function applyTodoAction(todosDir: string, ctx: ExtensionCommandContext, refresh: () => Promise<void>, done: () => void, record: TodoRecord, action: TodoMenuAction, setPrompt: (value: string) => void): Promise<"stay" | "exit"> {
    if (action === "refine") {
        setPrompt(buildRefinePrompt(record.id, record.title || "(untitled)"));
        done();
        return "exit";
    }
    if (action === "work") {
        setPrompt(`work on todo ${formatTodoId(record.id)} "${record.title || "(untitled)"}"`);
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
        ctx.ui.notify(`Released todo ${formatTodoId(record.id)}`, "info");
        return "stay";
    }
    if (action === "delete") {
        const removed = await deleteTodo(todosDir, record.id, ctx);
        if ("error" in removed) {
            ctx.ui.notify(removed.error, "error");
            return "stay";
        }
        await refresh();
        ctx.ui.notify(`Deleted todo ${formatTodoId(record.id)}`, "info");
        return "stay";
    }
    if (action === "reopen") {
        const reopened = await reopenTodoForUser(todosDir, record.id, ctx);
        if ("error" in reopened) {
            ctx.ui.notify(reopened.error, "error");
            return "stay";
        }
        await refresh();
        ctx.ui.notify(`Reopened todo ${formatTodoId(record.id)} and reset checklist`, "info");
        return "stay";
    }
    const status = action === "complete" ? "done" : "abandoned";
    const updated = await updateTodoStatus(todosDir, record.id, status, ctx);
    if ("error" in updated) {
        ctx.ui.notify(updated.error, "error");
        return "stay";
    }
    await refresh();
    ctx.ui.notify(`${action === "complete" ? "Completed" : "Abandoned"} todo ${formatTodoId(record.id)}`, "info");
    return "stay";
}

export function handleQuickAction(todo: TodoFrontMatter | null, action: TodoQuickAction, showCreateInput: () => void, done: () => void, setPrompt: (value: string) => void): void {
    if (action === "create") return showCreateInput();
    if (!todo) return;
    const title = getTodoTitle(todo);
    if (action === "refine") setPrompt(buildRefinePrompt(todo.id, title));
    else if (action === "work") setPrompt(`work on todo ${formatTodoId(todo.id)} "${title}"`);
    done();
}
