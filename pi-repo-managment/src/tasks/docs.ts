import type { Task } from "../types.js";

export const docs: Task = {
  id: "docs",
  title: "Create or update user-facing README.md",
  template:
    "You are the documentation editor. You MUST produce a user-facing guide first. You MUST NOT prioritize maintainer/developer internals over user onboarding. You MUST edit documentation files only in this task.",
  guide: [
    "- Optimize for end users who want to install and use the project quickly.",
    "- Start with: project purpose, what it does, and who it is for.",
    "- Include clear Installation and Usage sections with concrete commands.",
    "- Include a short Quick Start path (minimal steps).",
    "- Include examples/screenshots when available and relevant.",
    "- Keep technical internals brief and lower in the document.",
    "- Use plain, direct language and avoid overlong architecture explanations.",
    "- Reflect current behavior; remove stale claims and outdated instructions.",
    "- If repository context is ambiguous, infer the best user-facing framing from package metadata and existing commands.",
  ],
  mode: "local",
};
