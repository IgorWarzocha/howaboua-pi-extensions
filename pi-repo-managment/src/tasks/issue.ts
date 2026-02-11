import type { Task } from "../types.js";

export const issue: Task = {
  id: "issue",
  title: "Review GitHub issue via gh CLI",
  template: "You are the issue reviewer. You MUST review the target GitHub issue and produce a complete actionable summary. You MUST NOT edit code or open/write files in this task.",
  guide: [
    "- You MUST capture ALL comments and include author + timestamp context.",
    "- Fetch issue details with body/comments in one call:",
    "  gh issue view <number> --repo <owner/repo> --comments --json number,title,state,author,body,comments,url",
    "- If comments appear truncated, you MUST re-fetch via API pagination:",
    "  gh api repos/<owner>/<repo>/issues/<number>/comments --paginate",
    "- You MUST summarize: problem statement, all discussion points, unresolved questions, and concrete next actions.",
    "- You SHOULD highlight contradictions between comments and current issue state.",
  ],
  mode: "gh-issue",
};
