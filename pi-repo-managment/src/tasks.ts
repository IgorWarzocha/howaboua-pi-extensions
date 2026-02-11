import type { Task } from "./types.js";

export const setup = "Setup";

export const skill: Record<string, string> = {
  commit: [
    "Commit skill guidance:",
    "- Create a concise Conventional Commits-style subject: <type>(<scope>): <summary>",
    "- type MUST be explicit (feat/fix/docs/refactor/chore/test/perf).",
    "- summary MUST be imperative, <= 72 chars, no trailing period.",
    "- Body MAY be included when needed.",
    "- You MUST NOT add breaking-change markers, footers, or sign-offs.",
    "- You MUST stage only intended files and ask when scope is ambiguous.",
    "- Original commit skill says commit-only; this workflow explicitly requires push after commit.",
  ].join("\n"),
  github: [
    "GitHub skill guidance:",
    "- Use gh CLI for issues, PRs, runs, and API queries.",
    "- Use --repo owner/repo when not in a git directory.",
    "- Prefer structured output with --json and filter with --jq.",
    "- For PR checks, use gh pr checks.",
    "- For workflows, use gh run list/view and gh run view --log-failed when needed.",
    "- Use gh api for advanced fields not exposed by subcommands.",
  ].join("\n"),
};

export const tasks: Task[] = [
  {
    id: "docs",
    title: "Create or update repository docs",
    template: "You MUST create or update repository documentation based on current project state. Keep structure concise and practical. If you change docs, do only documentation edits in this run.",
    skills: [],
    mode: "local",
  },
  {
    id: "agents",
    title: "Create or update AGENTS.md",
    template: "You MUST create or update AGENTS.md with repository-specific instructions, strict constraints, and workflow guidance. Keep it actionable and compact.",
    skills: [],
    mode: "local",
  },
  {
    id: "commit",
    title: "Commit and push via GitHub CLI",
    template: "You MUST stage intended changes, create a concise Conventional Commits-style commit, and push via gh/git with safe defaults. You MUST fail fast on auth/remote errors.",
    skills: ["commit", "github"],
    mode: "gh-commit",
  },
  {
    id: "issue",
    title: "Review GitHub issue via gh CLI",
    template: "You MUST review the target GitHub issue via gh CLI and return a prioritized actionable summary with next steps.",
    skills: ["github"],
    mode: "gh-issue",
  },
  {
    id: "pr",
    title: "Review GitHub PR via gh CLI",
    template: "You MUST review the target GitHub pull request via gh CLI and return a prioritized actionable summary with next steps.",
    skills: ["github"],
    mode: "gh-pr",
  },
];
