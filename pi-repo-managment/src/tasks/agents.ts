import type { Task } from "../types.js";

export const agents: Task = {
  id: "agents",
  title: "Create or update AGENTS.md",
  template: "You are the AGENTS.md editor. You MUST enhance the root AGENTS.md with concise, repository-specific agent instructions. You MUST prefer enhancement over replacement unless the file is clearly boilerplate. Output SHOULD stay compact and high-signal.",
  guide: [
    "- AGENTS.md is injected into future session system prompts, so it MUST stay lightweight, precise, and concise.",
    "- Include only instructions that change agent behavior.",
    "- Use RFC 2119 keywords for requirement-level rules.",
    "- Keep one-shot verification commands; avoid long-running/watch commands.",
    "- Preserve accurate human-authored guidance when present.",
    "- Remove stale or generic boilerplate that no longer matches the repo.",
    "- Folder trees, exhaustive repository structure dumps, and generic file listings are STRICTLY PROHIBITED.",
    "- High-level task routing MAY be included only when it changes agent behavior and stays minimal.",
    "- Root file MUST stay global; task-specific details SHOULD be minimal.",
    "- You MUST NOT edit nested AGENTS.md files unless explicitly requested by the user.",
    "- You MUST NOT duplicate nested AGENTS.md content into the root file.",
  ],
  mode: "local",
};
