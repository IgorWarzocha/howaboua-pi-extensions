import type { TodoFrontMatter, TodoRecord } from "./types.js";
import { TODO_ID_PATTERN } from "./constants.js";

export function parseFrontMatter(text: string, idFallback: string): TodoFrontMatter {
    const data: TodoFrontMatter = {
        id: idFallback,
        title: "",
        tags: [],
        status: "open",
        created_at: "",
        assigned_to_session: undefined,
    };

    const trimmed = text.trim();
    if (!trimmed) return data;

    try {
        const parsed = JSON.parse(trimmed) as Partial<TodoFrontMatter> | null;
        if (!parsed || typeof parsed !== "object") return data;
        if (typeof parsed.id === "string" && parsed.id) data.id = parsed.id;
        if (typeof parsed.title === "string") data.title = parsed.title;
        if (typeof parsed.status === "string" && parsed.status) data.status = parsed.status;
        if (typeof parsed.created_at === "string") data.created_at = parsed.created_at;
        if (typeof parsed.assigned_to_session === "string" && parsed.assigned_to_session.trim()) {
            data.assigned_to_session = parsed.assigned_to_session;
        }
        if (Array.isArray(parsed.tags)) {
            data.tags = parsed.tags.filter((tag): tag is string => typeof tag === "string");
        }
    } catch {
        return data;
    }

    return data;
}

export function findJsonObjectEnd(content: string): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < content.length; i += 1) {
        const char = content[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === "\"") {
                inString = false;
            }
            continue;
        }

        if (char === "\"") {
            inString = true;
            continue;
        }

        if (char === "{") {
            depth += 1;
            continue;
        }

        if (char === "}") {
            depth -= 1;
            if (depth === 0) return i;
        }
    }

    return -1;
}

export function splitFrontMatter(content: string): { frontMatter: string; body: string } {
    if (!content.startsWith("{")) {
        return { frontMatter: "", body: content };
    }

    const endIndex = findJsonObjectEnd(content);
    if (endIndex === -1) {
        return { frontMatter: "", body: content };
    }

    const frontMatter = content.slice(0, endIndex + 1);
    const body = content.slice(endIndex + 1).replace(/^\r?\n+/, "");
    return { frontMatter, body };
}

export function parseTodoContent(content: string, idFallback: string): TodoRecord {
    const { frontMatter, body } = splitFrontMatter(content);
    const parsed = parseFrontMatter(frontMatter, idFallback);
    return {
        id: idFallback,
        title: parsed.title,
        tags: parsed.tags ?? [],
        status: parsed.status,
        created_at: parsed.created_at,
        assigned_to_session: parsed.assigned_to_session,
        body: body ?? "",
    };
}

export function serializeTodo(todo: TodoRecord): string {
    const frontMatter = JSON.stringify(
        {
            id: todo.id,
            title: todo.title,
            tags: todo.tags ?? [],
            status: todo.status,
            created_at: todo.created_at,
            assigned_to_session: todo.assigned_to_session || undefined,
        },
        null,
        2,
    );

    const body = todo.body ?? "";
    const trimmedBody = body.replace(/^\n+/, "").replace(/\s+$/, "");
    if (!trimmedBody) return `${frontMatter}\n`;
    return `${frontMatter}\n\n${trimmedBody}\n`;
}

export function validateTodoId(id: string): { id: string } | { error: string } {
    const normalized = normalizeTodoId(id);
    if (!normalized || !TODO_ID_PATTERN.test(normalized)) {
        return { error: "Invalid todo id. Expected TODO-<hex>." };
    }
    return { id: normalized.toLowerCase() };
}

export function normalizeTodoId(id: string): string {
    let trimmed = id.trim();
    if (trimmed.startsWith("#")) {
        trimmed = trimmed.slice(1);
    }
    if (trimmed.toUpperCase().startsWith("TODO-")) {
        trimmed = trimmed.slice(5);
    }
    return trimmed;
}
