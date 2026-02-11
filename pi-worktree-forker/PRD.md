# PRD: Pi Worktree Forker Extension

## Overview

The **Pi Worktree Forker** is an extension for the `pi` coding agent that automates the transition from a session-level "fork" to a filesystem-level "worktree".

Currently, when a user presses `Escape` twice in `pi` to branch a conversation, only the session context is duplicated. The working directory remains shared. This extension bridges that gap by allowing the user to automatically create a dedicated Git worktree for the new branch, ensuring complete isolation of code changes.

## Goals

- **Isolation**: Prevent uncommitted changes in the main branch from leaking into the fork (and vice-versa).
- **Efficiency**: Automate the manual steps of `git worktree add`, `cd`, and `pi --session`.
- **Flexibility**: Let the user decide on-the-fly if they want a worktree or just a session fork.

## User Flow

1.  User triggers a fork in `pi` (e.g., double-escape or `/fork`).
2.  The extension intercepts the fork event.
3.  If the workspace is a Git repo, the user is prompted: _"Create a git worktree for this fork?"_
4.  If yes:
    - A new branch is created.
    - A new worktree directory is created (sibling to the current one).
    - A new `pi` instance is prepared or launched in that directory.
5.  If no: The standard session-only fork proceed.

## Technical Requirements

### 1. Event Interception

- Must use `session_before_fork` to prompt the user.
- Must use `session_fork` to finalize the filesystem operations.

### 2. Git Operations

- **Detection**: Verify if `git rev-parse --is-inside-work-tree` is true.
- **Dirty Check**: Check `git status --porcelain`. Warn the user if uncommitted changes won't be in the new worktree (standard Git behavior).
- **Worktree Creation**: `git worktree add -b <branch-name> <path> <base-commit>`.

### 3. Workflow Integration

- The extension should ideally support `tmux` for "firing up" the new session.
- If `tmux` is detected, it should create a new window/pane.
- Otherwise, it should provide a clear command for the user to switch.

## Roadmap & MVP

- **Phase 1 (MVP)**: Detect Git, prompt user, create worktree, notify user of the path.
- **Phase 2**: Automatic `tmux` window spawning.
- **Phase 3**: Configuration for worktree naming patterns and base directory.
