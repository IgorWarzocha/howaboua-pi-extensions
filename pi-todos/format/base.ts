import type { TodoFrontMatter, TodoRecord } from "../types.js";
import { TODO_ID_PREFIX } from "../constants.js";
import { normalizeTodoId } from "../parser.js";

export function formatTodoId(id: string): string {
    return `${TODO_ID_PREFIX}${id}`;
}

export function displayTodoId(id: string): string {
    return formatTodoId(normalizeTodoId(id));
}

export function isTodoClosed(status: string): boolean {
    return ["closed", "done", "abandoned"].includes(status.toLowerCase());
}

export function deriveTodoStatus(todo: TodoRecord): string {
    if (!todo.checklist?.length) return todo.status;
    const checked = todo.checklist.filter(i => i.status === "checked").length;
    if (checked === 0) return "open";
    if (checked === todo.checklist.length) return "done";
    return "in-progress";
}

export function formatChecklistProgress(todo: TodoFrontMatter): string {
    if (!todo.checklist?.length) return "";
    const checked = todo.checklist.filter(i => i.status === "checked").length;
    return ` (${checked}/${todo.checklist.length})`;
}

export function getTodoTitle(todo: TodoFrontMatter): string {
    return todo.title || "(untitled)";
}

export function getTodoStatus(todo: TodoFrontMatter): string {
    return todo.status || "open";
}

export function clearAssignmentIfClosed(todo: TodoFrontMatter): void {
    if (isTodoClosed(getTodoStatus(todo))) todo.assigned_to_session = undefined;
}

export function sortTodos(todos: TodoFrontMatter[]): TodoFrontMatter[] {
    return [...todos].sort((a, b) => {
        const aClosed = isTodoClosed(a.status);
        const bClosed = isTodoClosed(b.status);
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
        const aAssigned = !aClosed && Boolean(a.assigned_to_session);
        const bAssigned = !bClosed && Boolean(b.assigned_to_session);
        if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
        if (aClosed && bClosed) {
            const aAbandoned = a.status.toLowerCase() === "abandoned";
            const bAbandoned = b.status.toLowerCase() === "abandoned";
            if (aAbandoned !== bAbandoned) return aAbandoned ? -1 : 1;
        }
        return (a.created_at || "").localeCompare(b.created_at || "");
    });
}

export function buildTodoSearchText(todo: TodoFrontMatter): string {
    const tags = todo.tags.join(" ");
    const assignment = todo.assigned_to_session ? `assigned:${todo.assigned_to_session}` : "";
    return `${formatTodoId(todo.id)} ${todo.id} ${todo.title} ${tags} ${todo.status} ${assignment}`.trim();
}

export function formatAssignmentSuffix(todo: TodoFrontMatter): string {
    return todo.assigned_to_session ? ` (assigned: ${todo.assigned_to_session})` : "";
}

export function formatTodoHeading(todo: TodoFrontMatter): string {
    const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
    const progress = formatChecklistProgress(todo);
    return `${formatTodoId(todo.id)} ${getTodoTitle(todo)}${tagText}${formatAssignmentSuffix(todo)}${progress}`;
}
