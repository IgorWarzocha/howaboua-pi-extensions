import * as path from "node:path";

export function ensureRelativePatchPath(patchPath: string): string {
  const normalized = patchPath.replace(/^@/, "").trim();
  if (!normalized) throw new Error("Patch path MUST NOT be empty. You MUST provide a relative file path.");
  if (path.isAbsolute(normalized)) {
    throw new Error(`Absolute paths are forbidden. You MUST use relative paths. Got: ${patchPath}`);
  }
  return normalized;
}

export function resolvePatchPath(cwd: string, patchPath: string): string {
  return path.resolve(cwd, ensureRelativePatchPath(patchPath));
}
