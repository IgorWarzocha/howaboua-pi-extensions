import type { Repo, Task } from "./types.js";
import { skill } from "./tasks.js";

function ref(task: Task, repo: Repo | undefined, number: number | undefined): string {
  if (!repo || !number) {
    return "";
  }
  if (task.mode === "gh-issue") {
    return `Review target MUST be https://github.com/${repo.slug}/issues/${String(number)}.`;
  }
  if (task.mode === "gh-pr") {
    return `Review target MUST be https://github.com/${repo.slug}/pull/${String(number)}.`;
  }
  return "";
}

export function build(task: Task, effort: string | undefined, repo: Repo | undefined, number: number | undefined, extra: string | undefined): string {
  const head = effort ? `Execution requirement: You MUST set reasoning effort to '${effort}' if supported before doing the task.\n\n` : "";
  const repoText = repo && task.mode !== "local"
    ? `Repository requirement: You MUST use repository '${repo.slug}' at local path '${repo.path}' for all git/gh operations. Use --repo ${repo.slug} when needed.\n\n`
    : "";
  const target = ref(task, repo, number);
  const targetText = target ? `${target}\n\n` : "";
  const extraText = extra && extra.trim().length > 0 ? `User addendum: ${extra.trim()}\n\n` : "";
  const rows = task.skills
    .map((name) => {
      const body = skill[name];
      if (!body) {
        return "";
      }
      return `Skill guidance (${name})\n${body}`;
    })
    .filter((item) => item.length > 0);
  const tail = rows.length > 0 ? `\n\n${rows.join("\n\n")}` : "";
  return `${head}${repoText}${targetText}${extraText}${task.template}${tail}`;
}
