import fs from "node:fs/promises";
import type { TodoSettings } from "../types.js";
import { DEFAULT_TODO_SETTINGS } from "../constants.js";
import { splitFrontMatter, parseFrontMatter } from "../parser.js";
import { isTodoClosed } from "../format.js";
import { getTodoSettingsPath } from "./path.js";

function normalizeTodoSettings(raw: Partial<TodoSettings>): TodoSettings {
  const gc = raw.gc ?? DEFAULT_TODO_SETTINGS.gc;
  const gcDays =
    raw.gcDays !== undefined && Number.isFinite(raw.gcDays)
      ? raw.gcDays
      : DEFAULT_TODO_SETTINGS.gcDays;
  return {
    gc: Boolean(gc),
    gcDays: Math.max(0, Math.floor(gcDays)),
  };
}

export async function readTodoSettings(todosDir: string): Promise<TodoSettings> {
  const settingsPath = getTodoSettingsPath(todosDir);
  let data: Partial<TodoSettings> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    data = JSON.parse(raw) as Partial<TodoSettings>;
  } catch {
    data = {};
  }
  return normalizeTodoSettings(data);
}

export async function garbageCollectTodos(todosDir: string, settings: TodoSettings): Promise<void> {
  if (!settings.gc) return;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(todosDir);
  } catch {
    return;
  }
  const cutoff = Date.now() - settings.gcDays * 24 * 60 * 60 * 1000;
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md"))
      .map(async (entry) => {
        const id = entry.slice(0, -3);
        const filePath = `${todosDir}/${entry}`;
        try {
          const content = await fs.readFile(filePath, "utf8");
          const parts = splitFrontMatter(content);
          const parsed = parseFrontMatter(parts.frontMatter, id);
          if (!isTodoClosed(parsed.status)) return;
          const stats = await fs.stat(filePath);
          if (!Number.isFinite(stats.mtimeMs)) return;
          if (stats.mtimeMs < cutoff) await fs.unlink(filePath);
        } catch {
          return;
        }
      }),
  );
}
