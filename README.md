# Pi Extensions Dev

A collection of user-ready extensions for Pi to add features like memory, workflows, Git automation, and advanced agent management.

## Project Purpose

This repository provides a set of modular capabilities that enhance the Pi coding agent. It is designed for users who want to add robust, local-first features to their AI assistant and for developers prototyping new extension patterns.

## Quick Start

Enable any extension by passing its path when starting Pi:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/pi-rfc-keywords-extension/src/index.ts
```

To make an extension persistent, add it to your `~/.pi/settings.json`:

```json
{
  "extensions": [
    "/home/igorw/Work/pi/pi-extensions-dev/pi-rfc-keywords-extension/src/index.ts"
  ]
}
```

## Available Extensions

### 1) RFC Keywords Extension
**Normalizes RFC 2119 requirement keywords in prompts.**
- **Path**: `pi-rfc-keywords-extension`
- **Use**: Write naturally (`must`, `should`, `may`); the extension rewrites them as uppercase RFC keywords before sending them to the model.

### 2) Remember Extension
**Semantic long-term memory for agents.**
- **Path**: `pi-remember-extension`
- **Use**: Store information using `remember`, search it with `recall`, and manage it with `forget`. Memories are stored locally in SQLite.

### 3) Workflows Tool
**Capture and reuse session outcomes as structured workflows.**
- **Path**: `pi-workflows-tool`
- **Use**: Use `/workflow` to convert recent successes into reusable skill definitions.

### 4) Web Fetch
**Fetch and convert web content to Markdown.**
- **Path**: `webfetch`
- **Use**: Provide a URL to the `webfetch` tool to get a clean Markdown representation of the page, optimized for AI consumption.

### 5) Question Tool
**Interactive TUI for answering agent questions.**
- **Path**: `pi-question-tool`
- **Use**: Run `/answer` or press `Ctrl+.` to extract questions from the last agent message and answer them one-by-one in a custom interface.

### 6) Todos Extension
**File-based task management for humans and agents.**
- **Path**: `pi-todos`
- **Use**: Manage project tasks with `/todos`. Agents can use the `todo` tool to track their own progress and dependencies.

### 7) Agent Manager
**Orchestrate specialized subagents with strict permissions.**
- **Path**: `pi-agent-manager`
- **Use**: Run `/agents` to create specialist subagents. The main agent can then delegate tasks via `invoke_subagent`.

### 8) Worktree Forker
**Create Git worktrees when forking sessions.**
- **Path**: `pi-worktree-forker`
- **Use**: Choose "Create Git Worktree" when using `/fork` to isolate experiments into separate branches and directories automatically.

### 9) Subdirectory Context
**Automatically load context based on where you are working.**
- **Path**: `pi-nested-agents-md`
- **Use**: Injects any `AGENTS.md` files found in the path hierarchy whenever an agent reads a file, ensuring local conventions are always respected.

### 10) Apply Patch
**Atomic file modifications for better reliability.**
- **Path**: `pi-apply-patch`
- **Use**: Enforces a single `apply_patch` call per turn, preventing fragmented edits and ensuring complex changes across multiple files succeed or fail together.

### 11) Hot Reload Extension
**Restart Pi while maintaining session state.**
- **Path**: `hot-reload-extension`
- **Use**: Call `hot_reload` to restart Pi in a new terminal window while automatically resuming the current session.

### 12) Spinners Extension
**Custom working messages.**
- **Path**: `pi-spinners`
- **Use**: Replaces the standard "Working..." message with a variety of humorous phrases to add personality to your sessions.

## Installation

### From npm (Recommended)
Most extensions are published and can be installed via the Pi package manager:

```bash
pi install npm:@pi-extensions-dev/<extension-name>
```

### From Local Source
Clone this repository and point Pi to the extension entry point:

```bash
pi -e /home/igorw/Work/pi/pi-extensions-dev/<folder>/src/index.ts
```

## Troubleshooting

- **Tool not found**: Ensure the extension is loaded (check Pi startup logs) and that your model has permission to use the tool.
- **Path issues**: Always use absolute paths when adding extensions to `settings.json`.
- **Conflicts**: Some extensions (like `pi-apply-patch`) deliberately disable standard tools like `edit` to enforce better patterns. Check the extension description if a tool goes missing.
