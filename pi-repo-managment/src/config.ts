import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Config } from "./types.js";

export function path(): string {
  return join(homedir(), ".pi", "repo-managment.json");
}

export function load(): Config {
  const file = path();
  if (!existsSync(file)) {
    return { models: {}, thinking: {} };
  }
  const raw = readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as Partial<Config>;
  if (!parsed.models || typeof parsed.models !== "object") {
    throw new Error("Configuration MUST contain a models object.");
  }
  if (parsed.thinking !== undefined && typeof parsed.thinking !== "object") {
    throw new Error("Configuration thinking field MUST be an object when provided.");
  }
  return { models: parsed.models, thinking: parsed.thinking ?? {} };
}

export function save(config: Config): void {
  const dir = join(homedir(), ".pi");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path(), JSON.stringify(config, null, 2));
}

