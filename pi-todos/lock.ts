import path from "node:path";
import fs from "node:fs/promises";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { LockInfo } from "./types.js";
import { displayTodoId } from "./format.js";

function getLockPath(todosDir: string, id: string): string {
  return path.join(todosDir, `${id}.lock`);
}

async function readLockInfo(lockPath: string): Promise<LockInfo | null> {
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    return JSON.parse(raw) as LockInfo;
  } catch {
    return null;
  }
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error)) return null;
  const value = error.code;
  return typeof value === "string" ? value : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown error";
}

export async function acquireLock(
  todosDir: string,
  id: string,
  ctx: ExtensionContext,
): Promise<(() => Promise<void>) | { error: string }> {
  const lockPath = getLockPath(todosDir, id);
  const session = ctx.sessionManager.getSessionFile();
  try {
    const handle = await fs.open(lockPath, "wx");
    const info: LockInfo = {
      id,
      pid: process.pid,
      session,
      created_at: new Date().toISOString(),
    };
    await handle.writeFile(JSON.stringify(info, null, 2), "utf8");
    await handle.close();
    return async () => {
      try {
        await fs.unlink(lockPath);
      } catch {
        return;
      }
    };
  } catch (error: unknown) {
    if (getErrorCode(error) !== "EEXIST") {
      return { error: `Failed to acquire lock: ${getErrorMessage(error)}` };
    }
    const info = await readLockInfo(lockPath);
    const owner = info?.session ? ` (session ${info.session})` : "";
    return { error: `Todo ${displayTodoId(id)} is locked${owner}. Try again later.` };
  }
}

export async function withTodoLock<T>(
  todosDir: string,
  id: string,
  ctx: ExtensionContext,
  fn: () => Promise<T>,
): Promise<T | { error: string }> {
  const lock = await acquireLock(todosDir, id, ctx);
  if (typeof lock === "object" && "error" in lock) return lock;
  try {
    return await fn();
  } finally {
    await lock();
  }
}
