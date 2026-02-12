import type { Theme } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoRecord } from "./types.js";
import { TODO_ID_PREFIX } from "./constants.js";
import { normalizeTodoId } from "./parser.js";

export function formatTodoId(id: string): string {
    return `${TODO_ID_PREFIX}${id}`;
}

export function displayTodoId(id: string): string {
    return formatTodoId(normalizeTodoId(id));
}

export function isTodoClosed(status: string): boolean {
    return ["closed", "done"].includes(status.toLowerCase());
}

export function getTodoTitle(todo: TodoFrontMatter): string {
    return todo.title || "(untitled)";
}

export function getTodoStatus(todo: TodoFrontMatter): string {
    return todo.status || "open";
}

export function clearAssignmentIfClosed(todo: TodoFrontMatter): void {
    if (isTodoClosed(getTodoStatus(todo))) {
        todo.assigned_to_session = undefined;
    }
}

export function sortTodos(todos: TodoFrontMatter[]): TodoFrontMatter[] {
    return [...todos].sort((a, b) => {
        const aClosed = isTodoClosed(a.status);
        const bClosed = isTodoClosed(b.status);
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
        const aAssigned = !aClosed && Boolean(a.assigned_to_session);
        const bAssigned = !bClosed && Boolean(b.assigned_to_session);
        if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
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

export function renderAssignmentSuffix(
    theme: Theme,
    todo: TodoFrontMatter,
    currentSessionId?: string,
): string {
    if (!todo.assigned_to_session) return "";
    const isCurrent = todo.assigned_to_session === currentSessionId;
    const color = isCurrent ? "success" : "dim";
    const suffix = isCurrent ? ", current" : "";
    return theme.fg(color, ` (assigned: ${todo.assigned_to_session}${suffix})`);
}

export function formatTodoHeading(todo: TodoFrontMatter): string {
    const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
    return `${formatTodoId(todo.id)} ${getTodoTitle(todo)}${tagText}${formatAssignmentSuffix(todo)}`;
}

export function buildRefinePrompt(todoId: string, title: string): string {
    return (
        `let's refine task ${formatTodoId(todoId)} "${title}":\n\n` +
        "You MUST NOT rewrite the todo yet. You MUST ask clear, concrete questions to clarify:\n" +
        "- What files MUST be read?\n" +
        "- What dependencies exist?\n" +
        "- What is the acceptance criteria?\n\n" +
        "You SHOULD research the codebase before asking questions. You MAY ask me for clarification on ambiguous points. " +
        "Wait for my answers before drafting any structured description.\n\n"
    );
}

export function buildCreatePrompt(userPrompt: string): string {
    return (
        "You MUST call the todo tool to create a todo for the following task. Before creating:\n\n" +
        "1. You MUST read relevant files to understand the codebase context\n" +
        "2. You SHOULD research the internet if external knowledge is needed\n" +
        "3. You MAY ask me clarifying questions if requirements are ambiguous\n\n" +
        "You MUST NOT just create a todo without proper context. Take time to understand the task first.\n\n" +
        `Task: ${userPrompt}`
    );
}

export function splitTodosByAssignment(todos: TodoFrontMatter[]): {
    assignedTodos: TodoFrontMatter[];
    openTodos: TodoFrontMatter[];
    closedTodos: TodoFrontMatter[];
} {
    const assignedTodos: TodoFrontMatter[] = [];
    const openTodos: TodoFrontMatter[] = [];
    const closedTodos: TodoFrontMatter[] = [];
    for (const todo of todos) {
        if (isTodoClosed(getTodoStatus(todo))) {
            closedTodos.push(todo);
            continue;
        }
        if (todo.assigned_to_session) {
            assignedTodos.push(todo);
        } else {
            openTodos.push(todo);
        }
    }
    return { assignedTodos, openTodos, closedTodos };
}

export function formatTodoList(todos: TodoFrontMatter[]): string {
    if (!todos.length) return "No todos.";

    const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
    const lines: string[] = [];
    const pushSection = (label: string, sectionTodos: TodoFrontMatter[]) => {
        lines.push(`${label} (${sectionTodos.length}):`);
        if (!sectionTodos.length) {
            lines.push("  none");
            return;
        }
        for (const todo of sectionTodos) {
            lines.push(`  ${formatTodoHeading(todo)}`);
        }
    };

    pushSection("Assigned todos", assignedTodos);
    pushSection("Open todos", openTodos);
    pushSection("Closed todos", closedTodos);
    return lines.join("\n");
}

export function serializeTodoForAgent(todo: TodoRecord): string {
    const payload = { ...todo, id: formatTodoId(todo.id) };
    return JSON.stringify(payload, null, 2);
}

export function serializeTodoListForAgent(todos: TodoFrontMatter[]): string {
    const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
    const mapTodo = (todo: TodoFrontMatter) => ({ ...todo, id: formatTodoId(todo.id) });
    return JSON.stringify(
        {
            assigned: assignedTodos.map(mapTodo),
            open: openTodos.map(mapTodo),
            closed: closedTodos.map(mapTodo),
        },
        null,
        2,
    );
}

export function renderTodoHeading(theme: Theme, todo: TodoFrontMatter, currentSessionId?: string): string {
    const closed = isTodoClosed(getTodoStatus(todo));
    const titleColor = closed ? "dim" : "text";
    const tagText = todo.tags.length ? theme.fg("dim", ` [${todo.tags.join(", ")}]`) : "";
    const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
    return (
        theme.fg("accent", formatTodoId(todo.id)) +
        " " +
        theme.fg(titleColor, getTodoTitle(todo)) +
        tagText +
        assignmentText
    );
}

export function renderTodoList(
    theme: Theme,
    todos: TodoFrontMatter[],
    expanded: boolean,
    currentSessionId?: string,
): string {
    if (!todos.length) return theme.fg("dim", "No todos");

    const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
    const lines: string[] = [];
    const pushSection = (label: string, sectionTodos: TodoFrontMatter[]) => {
        lines.push(theme.fg("muted", `${label} (${sectionTodos.length})`));
        if (!sectionTodos.length) {
            lines.push(theme.fg("dim", "  none"));
            return;
        }
        const maxItems = expanded ? sectionTodos.length : Math.min(sectionTodos.length, 3);
        for (let i = 0; i < maxItems; i++) {
            lines.push(`  ${renderTodoHeading(theme, sectionTodos[i], currentSessionId)}`);
        }
        if (!expanded && sectionTodos.length > maxItems) {
            lines.push(theme.fg("dim", `  ... ${sectionTodos.length - maxItems} more`));
        }
    };

    const sections: Array<{ label: string; todos: TodoFrontMatter[] }> = [
        { label: "Assigned todos", todos: assignedTodos },
        { label: "Open todos", todos: openTodos },
        { label: "Closed todos", todos: closedTodos },
    ];

    sections.forEach((section, index) => {
        if (index > 0) lines.push("");
        pushSection(section.label, section.todos);
    });

    return lines.join("\n");
}

export function renderTodoDetail(theme: Theme, todo: TodoRecord, expanded: boolean): string {
    const summary = renderTodoHeading(theme, todo);
    if (!expanded) return summary;

    const tags = todo.tags.length ? todo.tags.join(", ") : "none";
    const createdAt = todo.created_at || "unknown";
    const bodyText = todo.body?.trim() ? todo.body.trim() : "No details yet.";
    const bodyLines = bodyText.split("\n");

    const lines = [
        summary,
        theme.fg("muted", `Status: ${getTodoStatus(todo)}`),
        theme.fg("muted", `Tags: ${tags}`),
        theme.fg("muted", `Created: ${createdAt}`),
        "",
        theme.fg("muted", "Body:"),
        ...bodyLines.map((line) => theme.fg("text", `  ${line}`)),
    ];

    return lines.join("\n");
}

export function appendExpandHint(theme: Theme, text: string): string {
    return `${text}\n${theme.fg("dim", `(${keyHint("expandTools", "to expand")})`)}`;
}
