import type { Theme } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import type { ChecklistItem, TodoFrontMatter, TodoRecord } from "./types.js";
import { TODO_ID_PREFIX } from "./constants.js";
import { normalizeTodoId } from "./parser.js";

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
    const progress = formatChecklistProgress(todo);
    return `${formatTodoId(todo.id)} ${getTodoTitle(todo)}${tagText}${formatAssignmentSuffix(todo)}${progress}`;
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
        "3. You MUST include a non-empty checklist when creating the todo\n" +
        "4. You MAY ask me clarifying questions if requirements are ambiguous\n\n" +
        "You MUST NOT just create a todo without proper context. You MUST provide actionable checklist items with short IDs (e.g., \"1\", \"2\", \"3\").\n\n" +
        `Task: ${userPrompt}`
    );
}

export function buildEditChecklistPrompt(todoId: string, title: string, checklist: ChecklistItem[], userIntent: string): string {
    const checklistText = checklist.map(item => {
        const status = item.status === "checked" ? "[x]" : "[ ]";
        return `  ${status} ${item.id}: ${item.title}`;
    }).join("\n");
    return (
        `Update the checklist for ${formatTodoId(todoId)} "${title}" based on this request:\n` +
        `"${userIntent}"\n\n` +
        `Current checklist:\n${checklistText}\n\n` +
        "Use the todo tool's `update` action to modify the checklist array. " +
        "Assign short IDs to new items (e.g., \"1\", \"2\", \"3\")."
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
    const payload: Record<string, unknown> = { ...todo, id: formatTodoId(todo.id) };
    const hint = buildProgressHint(todo);
    if (hint) payload.agent_hint = hint;
    return JSON.stringify(payload, null, 2);
}

export function buildProgressHint(todo: TodoRecord): string | undefined {
    if (!todo.checklist?.length) return undefined;
    const checked = todo.checklist.filter(i => i.status === "checked").length;
    const total = todo.checklist.length;
    const ratio = checked / total;
    if (checked < 2) return undefined;
    if (ratio < 0.5) return undefined;
    return `Progress is ${checked}/${total}. You MAY read the full todo now if you need refreshed context before the next step.`;
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
    const derivedStatus = "checklist" in todo && todo.checklist?.length 
        ? deriveTodoStatus(todo as TodoRecord) 
        : getTodoStatus(todo);
    const closed = isTodoClosed(derivedStatus);
    const titleColor = closed ? "dim" : "text";
    const tagText = todo.tags.length ? theme.fg("dim", ` [${todo.tags.join(", ")}]`) : "";
    const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
    const progress = formatChecklistProgress(todo);
    const progressText = progress ? theme.fg("muted", progress) : "";
    return (
        theme.fg("accent", formatTodoId(todo.id)) +
        " " +
        theme.fg(titleColor, getTodoTitle(todo)) +
        tagText +
        assignmentText +
        progressText
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

    const derivedStatus = deriveTodoStatus(todo);
    const tags = todo.tags.length ? todo.tags.join(", ") : "none";
    const createdAt = todo.created_at || "unknown";
    const bodyText = todo.body?.trim() ? todo.body.trim() : "No details yet.";
    const bodyLines = bodyText.split("\n");

    const checklistLines = todo.checklist?.length ? renderChecklist(theme, todo.checklist) : [];

    const lines = [
        summary,
        theme.fg("muted", `Status: ${derivedStatus}`),
        theme.fg("muted", `Tags: ${tags}`),
        theme.fg("muted", `Created: ${createdAt}`),
        "",
        ...checklistLines,
        checklistLines.length ? "" : "",
        theme.fg("muted", "Body:"),
        ...bodyLines.map((line) => theme.fg("text", `  ${line}`)),
    ];

    return lines.join("\n");
}

export function appendExpandHint(theme: Theme, text: string): string {
    return `${text}\n${theme.fg("dim", `(${keyHint("expandTools", "to expand")})`)}`;
}

export function renderChecklist(theme: Theme, checklist: ChecklistItem[]): string[] {
    if (!checklist.length) return [];
    const lines: string[] = [];
    const checked = checklist.filter(i => i.status === "checked").length;
    lines.push(theme.fg("muted", `Progress: ${checked}/${checklist.length} items complete`));
    lines.push("");
    for (const item of checklist) {
        const checkbox = item.status === "checked" 
            ? theme.fg("success", "[x]") 
            : theme.fg("dim", "[ ]");
        const titleColor = item.status === "checked" ? "dim" : "text";
        lines.push(`${checkbox} ${theme.fg(titleColor, item.title)}`);
    }
    return lines;
}

export function formatTickResult(todo: TodoRecord, tickedItem: ChecklistItem | undefined, remaining: ChecklistItem[], allComplete: boolean): string {
    const title = getTodoTitle(todo);
    const lines: string[] = [];

    if (tickedItem) {
        lines.push(`Ticked item ${tickedItem.id} "${tickedItem.title}".`);
    }

    if (allComplete) {
        lines.push("");
        lines.push(`${formatTodoId(todo.id)} "${title}" is now done.`);
    } else if (remaining.length > 0) {
        lines.push("");
        lines.push(`Remaining in ${formatTodoId(todo.id)} "${title}":`);
        for (const item of remaining) {
            lines.push(`  [ ] ${item.title}`);
        }
        lines.push("");
        lines.push("Continue working through the remaining items.");
    }

    return lines.join("\n");
}
