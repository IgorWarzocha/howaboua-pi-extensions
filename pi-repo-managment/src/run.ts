import { spawn } from "node:child_process";
import type { Repo, Task } from "./types.js";
import { build } from "./prompt.js";

type Update = {
  output: string;
  tools: string[];
};

function text(line: string): string {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
    };
    if (event.type !== "message_end") {
      return "";
    }
    if (!event.message || event.message.role !== "assistant") {
      return "";
    }
    if (!event.message.content || !Array.isArray(event.message.content)) {
      return "";
    }
    const rows = event.message.content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text ?? "");
    return rows.join("");
  } catch {
    return "";
  }
}

function tool(line: string): string {
  try {
    const event = JSON.parse(line) as { type?: string; toolName?: string };
    if (event.type !== "tool_execution_start") {
      return "";
    }
    return event.toolName ?? "";
  } catch {
    return "";
  }
}

export function run(
  task: Task,
  model: string | undefined,
  effort: string | undefined,
  cwd: string,
  repo: Repo | undefined,
  number: number | undefined,
  extra: string | undefined,
  onUpdate?: (update: Update) => void,
): Promise<string> {
  const args = ["--mode", "json", "--no-session", "-p", build(task, effort, repo, number, extra)];
  if (effort && effort !== "default") {
    args.unshift(effort);
    args.unshift("--thinking");
  }
  if (model) {
    args.unshift(model);
    args.unshift("--model");
  }
  return new Promise((resolve, reject) => {
    const proc = spawn("pi", args, {
      cwd,
      detached: false,
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    });
    let buf = "";
    let last = "";
    const tools: string[] = [];
    proc.stdout.on("data", (data) => {
      buf += data.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const t = tool(line);
        if (t) {
          tools.push(t);
          if (tools.length > 4) {
            tools.shift();
          }
          if (onUpdate) {
            onUpdate({ output: last, tools });
          }
        }
        const out = text(line);
        if (out) {
          last = out;
          if (onUpdate) {
            onUpdate({ output: last, tools });
          }
        }
      }
    });
    proc.on("error", (err) => {
      reject(new Error(`Subagent process MUST start successfully: ${String(err.message)}`));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(last || "(No assistant output from subagent)");
        return;
      }
      reject(new Error(`Subagent process MUST exit with code 0. Received: ${String(code)}`));
    });
  });
}
