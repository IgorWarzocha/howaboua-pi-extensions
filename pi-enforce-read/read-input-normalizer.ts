import type { FileInput } from "./read-tool-types.js";

export function normalizeFilesInput(input: unknown): FileInput[] {
  let normalizedFiles: FileInput[] = [];
  let normalizedInput = input;

  if (typeof normalizedInput === "string") {
    const trimmed = normalizedInput.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        normalizedInput = JSON.parse(trimmed);
      } catch {
        normalizedFiles = [{ path: trimmed }];
      }
    } else {
      normalizedFiles = [{ path: trimmed }];
    }
  }

  if (Array.isArray(normalizedInput)) {
    normalizedFiles = normalizedInput.map((file) => {
      if (typeof file === "string") return { path: file };
      return file as FileInput;
    });
  } else if (
    typeof normalizedInput === "object" &&
    normalizedInput !== null &&
    "files" in normalizedInput &&
    Array.isArray((normalizedInput as { files: unknown }).files)
  ) {
    const files = (normalizedInput as { files: unknown[] }).files;
    normalizedFiles = files.map((file) => {
      if (typeof file === "string") return { path: file };
      return file as FileInput;
    });
  } else if (
    typeof normalizedInput === "object" &&
    normalizedInput !== null &&
    "path" in normalizedInput
  ) {
    normalizedFiles = [normalizedInput as FileInput];
  }

  return normalizedFiles;
}
