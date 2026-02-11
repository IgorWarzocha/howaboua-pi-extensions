import type { Repo, Task } from "./types.js";

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

export function build(
  task: Task,
  effort: string | undefined,
  repo: Repo | undefined,
  number: number | undefined,
  extra: string | undefined,
): string {
  const repoText = repo
    ? `Repository requirement: You MUST operate only within local path '${repo.path}'. You MUST treat this as the target repository for the entire task.${repo.slug ? ` For GitHub operations, use repository '${repo.slug}' and pass --repo ${repo.slug} when needed.` : ""}\n\n`
    : "";
  const target = ref(task, repo, number);
  const targetText = target ? `${target}\n\n` : "";
  const extraText = extra && extra.trim().length > 0 ? `User addendum: ${extra.trim()}\n\n` : "";
  const tail = task.guide.length > 0 ? `\n\n${task.guide.join("\n")}` : "";
  return `${repoText}${targetText}${extraText}${task.template}${tail}`;
}
