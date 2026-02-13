import path from "node:path";
import { TODO_DIR_NAME, TODO_PATH_ENV, TODO_SETTINGS_NAME } from "../constants.js";

export function getTodosDir(cwd: string): string {
    const overridePath = process.env[TODO_PATH_ENV];
    if (overridePath && overridePath.trim()) {
        return path.resolve(cwd, overridePath.trim());
    }
    return path.resolve(cwd, TODO_DIR_NAME);
}

export function getTodosDirLabel(cwd: string): string {
    const overridePath = process.env[TODO_PATH_ENV];
    if (overridePath && overridePath.trim()) {
        return path.resolve(cwd, overridePath.trim());
    }
    return TODO_DIR_NAME;
}

export function getTodoSettingsPath(todosDir: string): string {
    return path.join(todosDir, TODO_SETTINGS_NAME);
}

export function getTodoPath(todosDir: string, id: string): string {
    return path.join(todosDir, `${id}.md`);
}
