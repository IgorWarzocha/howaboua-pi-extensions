import type { Task } from "../types.js";

export const commit: Task = {
  id: "commit",
  title: "Commit and push via GitHub CLI",
  template:
    "You are the repository committer. You MUST commit and push existing local changes only. You MUST NOT edit source code in this task. You MUST fail fast on auth/remote errors.",
  guide: [
    "- Create a concise Conventional Commits-style subject: <type>(<scope>): <summary>",
    "- type MUST be explicit (feat/fix/docs/refactor/chore/test/perf).",
    "- summary MUST be imperative, <= 72 chars, no trailing period.",
    "- Body MAY be included when needed.",
    "- You MUST NOT add breaking-change markers, footers, or sign-offs.",
    "- You MUST commit all currently staged changes; if nothing is staged, you MUST stage all tracked modifications and new files before commit.",
    "- Commit workflow here MUST push after commit.",
    "- Use gh CLI for issues, PRs, runs, and API queries.",
    "- Use --repo owner/repo when not in a git directory.",
    "- Prefer structured output with --json and filter with --jq.",
    "- Recommended flow: git status --porcelain -> git add -A -> git commit -> git push.",
    "- If push fails due to missing upstream, use: git push -u origin HEAD.",
  ],
  mode: "gh-commit",
};
