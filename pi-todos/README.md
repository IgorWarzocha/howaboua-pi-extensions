# pi-todos

`pi-todos` adds a practical, checklist-first todo system to Pi.

It gives you an interactive `/todo` terminal UI for fast manual control.

The extension is designed for real task tracking during coding sessions, not just note-taking.

## What you can do

- Create todos with required checklists
- Track progress by checking items on and off
- Keep richer details in markdown body text
- Move work through lifecycle states (open, in-progress, done, abandoned, closed)
- Work with assigned tasks across sessions
- Search and list open vs closed work quickly in the UI

## Checklist-first workflow

This extension treats checklists as the source of truth for progress.

- New todos require a non-empty checklist
- Progress is meant to happen through checklist ticking
- Status is derived from checklist completion for checklist-based work

This keeps execution grounded in concrete, checkable steps.

## Everyday usage

### 1. Open the UI

Use:

- `/todo`

In the UI you can:

- create, work, refine, complete, abandon, reopen, release, or delete
- inspect details and edit checklist items
- use explicit search mode for predictable keyboard navigation

### 2. Keyboard workflow highlights

`/todo` is optimized for terminal reliability.

- list view:
  - `Ctrl+X` opens leader mode (2s timeout, `Ctrl+X`/`x` cancels)
  - `/` enters search mode
  - while search is active, navigation keys are ignored and `Enter` exits search mode
  - `j/k` and arrows navigate when not in search mode
- detail view:
  - `j/k` move action selection
  - `J/K` scroll preview content
  - `v` toggles preview visibility
  - checklist edit is available through leader mode (`Ctrl+X` then `e`)
- create view:
  - `Enter` submits
  - `Shift+Enter`, `Ctrl+Enter`, or `Alt+Enter` insert new lines
  - input wraps across lines for longer task descriptions

## Assignment and collaboration behavior

`pi-todos` supports multi-session safety:

- tasks can be claimed and released per session
- conflicting updates are blocked when another session owns a task

## Storage

Plans are stored as markdown files with frontmatter in your project plans directory.

By default, this is:

- `.pi/plans/prds`, `.pi/plans/specs`, and `.pi/plans/todos`

## Why this extension is useful

`pi-todos` helps keep work clear and durable across long sessions:

- clear next actions
- auditable progress
- fewer dropped tasks
- smoother handoff between you and the agent
