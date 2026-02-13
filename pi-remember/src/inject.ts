type Scope = "global" | "project" | "both";
type Config = {
  enabled: boolean;
  scope: Scope;
  inject: {
    count: number;
    lowThreshold: number;
    highThreshold: number;
  };
};
type Hit = {
  content: string;
  score: number;
  source: string;
};

type Search = (cwd: string, query: string, scope: Scope) => Promise<Hit[]>;

type User = {
  role: "user";
  content:
    | string
    | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  timestamp: number;
};
export function getUserText(message: User): string {
  if (typeof message.content === "string") return message.content;
  const lines: string[] = [];
  for (const item of message.content) {
    if (item.type !== "text") continue;
    lines.push(item.text ?? "");
  }
  return lines.join("\n");
}
export function appendUserBlock(message: User, block: string): User {
  if (typeof message.content === "string") return { ...message, content: `${message.content}\n\n${block}` };
  const content = message.content.slice();
  content.push({ type: "text", text: `\n\n${block}` });
  return { ...message, content };
}
export async function buildMemoryBlock(
  text: string,
  config: Config,
  cwd: string,
  search: Search,
): Promise<string | null> {
  if (!text.trim()) return null;
  if (text.includes("<memory_context>")) return null;
  const results = await search(cwd, text.slice(0, 500), config.scope);
  const filtered = results.filter((r) => r.score >= config.inject.lowThreshold);
  const picked = filtered.slice(0, config.inject.count);
  if (!picked.length) return "<memory_context>\n[none] no relevant memories\n</memory_context>";
  const lines = picked.map((r) => {
    const tag = r.score >= config.inject.highThreshold ? "[important]" : "[related]";
    const sourceTag = config.scope === "both" ? ` [${r.source}]` : "";
    return `${tag}${sourceTag} ${r.content}`;
  });
  return `<memory_context>\n${lines.join("\n")}\n</memory_context>`;
}
export async function transformInput(
  text: string,
  config: Config,
  cwd: string,
  search: Search,
): Promise<string | null> {
  let body = text;
  let prefix = "";
  if (body.startsWith("/")) {
    const space = body.indexOf(" ");
    if (space === -1) return null;
    prefix = body.slice(0, space + 1);
    body = body.slice(space + 1);
  }
  const block = await buildMemoryBlock(body, config, cwd, search);
  if (!block) return null;
  return `${prefix}${body}\n\n${block}`;
}
