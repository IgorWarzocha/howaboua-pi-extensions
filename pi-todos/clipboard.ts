import path from "node:path";
import { copyToClipboard } from "@mariozechner/pi-coding-agent";
import type { TodoRecord } from "./types.js";
import { getTodoPath } from "./file-io.js";

export function copyTodoPathToClipboard(
    todosDir: string,
    todoId: string,
    notify: (message: string, type: "info" | "error") => void,
) {
    const filePath = getTodoPath(todosDir, todoId);
    const absolutePath = path.resolve(filePath);
    try {
        copyToClipboard(absolutePath);
        notify(`Copied ${absolutePath} to clipboard`, "info");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(message, "error");
    }
}

export function copyTodoTextToClipboard(
    record: TodoRecord,
    notify: (message: string, type: "info" | "error") => void,
) {
    const title = record.title || "(untitled)";
    const body = record.body?.trim() || "";
    const text = body ? `# ${title}\n\n${body}` : `# ${title}`;
    try {
        copyToClipboard(text);
        notify("Copied todo text to clipboard", "info");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(message, "error");
    }
}
