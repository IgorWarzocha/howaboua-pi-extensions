import fs from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import type { TodoFrontMatter } from "../types.js";
import { splitFrontMatter, parseFrontMatter } from "../parser.js";
import { sortTodos } from "../format.js";

function toTodo(id: string, content: string): TodoFrontMatter {
    const parts = splitFrontMatter(content);
    const parsed = parseFrontMatter(parts.frontMatter, id);
    return {
        id,
        title: parsed.title,
        tags: parsed.tags ?? [],
        status: parsed.status,
        created_at: parsed.created_at,
        assigned_to_session: parsed.assigned_to_session,
    };
}

export async function listTodos(todosDir: string): Promise<TodoFrontMatter[]> {
    let entries: string[] = [];
    try {
        entries = await fs.readdir(todosDir);
    } catch {
        return [];
    }
    const todos: TodoFrontMatter[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const id = entry.slice(0, -3);
        try {
            const content = await fs.readFile(`${todosDir}/${entry}`, "utf8");
            todos.push(toTodo(id, content));
        } catch {
            continue;
        }
    }
    return sortTodos(todos);
}

export function listTodosSync(todosDir: string): TodoFrontMatter[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(todosDir);
    } catch {
        return [];
    }
    const todos: TodoFrontMatter[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const id = entry.slice(0, -3);
        try {
            const content = readFileSync(`${todosDir}/${entry}`, "utf8");
            todos.push(toTodo(id, content));
        } catch {
            continue;
        }
    }
    return sortTodos(todos);
}
