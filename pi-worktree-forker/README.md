# Pi Worktree Forker

Automatically create a Git worktree when you fork a session in Pi.

## Features
- **Smart Interception**: Hooks into the `/fork` command and the double-escape "thread" gesture.
- **Git Awareness**: Automatically detects if you are in a Git repository.
- **Workflow Automation**: 
    - Creates a new unique branch.
    - Creates a sibling worktree directory.
    - Provides a "one-liner" command to jump into the new workspace and continue the session.

## Installation (Dev)
To load this extension directly in Pi:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/pi-worktree-forker/src/index.ts
```

## Usage
1.  Open Pi in a Git repository.
2.  Press `Escape` twice (when the editor is empty) or run `/fork`.
3.  Choose a user message to fork from.
4.  Select **"Create Git Worktree + Branch"** from the popup selector.
5.  Follow the instructions in the chat to switch to the new worktree.

## Technical Details
- **Events**: Uses `session_before_fork` for the UI prompt and `session_fork` for the Git heavy lifting.
- **State**: Tracks your UI selection using a transient variable in the module scope.
- **Isolation**: Worktrees are created as siblings to your current repository root to avoid `node_modules` pollution and nested Git issues.
