import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Pi Worktree Forker Extension
 *
 * Intercepts fork events to automatically create git worktrees.
 */

// Simple state to track user decision across events
let pendingWorktreeDecision = false;

export default function (pi: ExtensionAPI) {
  // 1. Before fork: Prompt the user
  pi.on("session_before_fork", async (_event, ctx) => {
    pendingWorktreeDecision = false;

    // Check if we are in a git repo
    try {
      const isGit = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"]);
      if (isGit.stdout.trim() !== "true") return;
    } catch {
      return;
    }

    const choice = await ctx.ui.select(
      "Git Worktree Forker",
      ["Session Fork only (Default)", "Create Git Worktree + Branch"],
      { timeout: 10000 },
    );

    if (choice === "Create Git Worktree + Branch") {
      pendingWorktreeDecision = true;
    }
  });

  // 2. After fork: Perform git operations
  pi.on("session_fork", async (event, ctx) => {
    if (!pendingWorktreeDecision) return;
    pendingWorktreeDecision = false;

    try {
      const repoRootRes = await pi.exec("git", ["rev-parse", "--show-toplevel"]);
      const repoRoot = repoRootRes.stdout.trim();
      const repoName = path.basename(repoRoot);

      // Generate a safe unique name for the worktree
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const forkName = `fork-${timestamp}`;

      // sibling directory
      const parentDir = path.dirname(repoRoot);
      const worktreePath = path.join(parentDir, `${repoName}-${forkName}`);
      const branchName = `pi/${forkName}`;

      ctx.ui.notify(`Creating worktree at ${worktreePath}...`, "info");

      // Execute git worktree add
      // We use -b to create a new branch from current HEAD
      await pi.exec("git", ["worktree", "add", "-b", branchName, worktreePath, "HEAD"], {
        cwd: repoRoot,
      });

      const sessionFile = ctx.sessionManager.getSessionFile();
      const resumeCmd = `pi --session ${sessionFile}`;

      ctx.ui.notify(`✓ Worktree created on branch ${branchName}`, "info");

      // Output a "recipe" for the user to continue in the new worktree
      pi.sendMessage({
        customType: "worktree-fork-info",
        display: true,
        content: [
          { type: "text", text: `### 🌲 Git Worktree Created\n\n` },
          {
            type: "text",
            text: `Your session was forked and a new Git worktree was prepared.\n\n`,
          },
          { type: "text", text: `**Directory:** \`${worktreePath}\`\n` },
          { type: "text", text: `**Branch:** \`${branchName}\`\n\n` },
          { type: "text", text: `To continue in the new worktree, run:\n` },
          { type: "text", text: `\`\`\`bash\ncd "${worktreePath}" && ${resumeCmd}\n\`\`\`` },
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`Failed to create worktree: ${msg}`, "error");
    }
  });
}
