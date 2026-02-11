import type { Task } from "../types.js";

export const pr: Task = {
  id: "pr",
  title: "Review GitHub PR via gh CLI",
  template: "You are the pull-request reviewer. You MUST review the target PR and produce a complete actionable summary. You MUST NOT edit code or open/write files in this task.",
  guide: [
    "- You MUST capture ALL discussion: PR body, issue comments, reviews, and inline review comments.",
    "- Base pull request data:",
    "  gh pr view <number> --repo <owner/repo> --comments --json number,title,state,author,body,comments,reviews,files,reviewDecision,url",
    "- Inline review comments (separate endpoint):",
    "  gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate",
    "- You SHOULD check status checks when relevant:",
    "  gh pr checks <number> --repo <owner/repo>",
    "- You MUST summarize: change scope, all reviewer feedback threads, unresolved blockers, and next actions.",
    "- You SHOULD call out conflicting reviewer guidance explicitly.",
  ],
  mode: "gh-pr",
};
