# pi-todos

`pi-todos` adds a checklist-first planning system to Pi.

It provides an interactive `/todo` UI for managing three document types:

- PRDs
- specs
- todos

## What you can do

- create PRD/spec/todo plan files under `.pi/plans`
- open focused list views for tasks, PRDs, specs, and closed items
- run work/refine/review flows from the action menu
- attach and validate bidirectional links between related plan files
- edit todo checklists directly from the UI
- claim/release assignment per session

## Checklist and status model

For todo items, checklists are the primary progress signal:

- todos MUST include a non-empty checklist on create
- checking items updates progress deterministically
- status is derived from checklist completion for checklist-based work

## Keyboard workflow highlights

- list views:
  - `j/k` or arrows to move
  - `Enter` to open actions
  - `/` to search
  - `Ctrl+X` to open **More options** (auto-timeout)
  - `Tab` cycles list panes
- detail/actions:
  - `j/k` move through actions
  - `v` opens detail overlay
  - overlay uses `j/k` for scrolling
  - `Esc` returns back
- create/edit inputs:
  - `Enter` submits
  - `Shift+Enter`, `Ctrl+Enter`, or `Alt+Enter` inserts new lines

## Storage

Plan files are stored in:

- `.pi/plans/prds`
- `.pi/plans/specs`
- `.pi/plans/todos`

Each item is markdown with frontmatter and uses `type` (`prd`, `spec`, `todo`) for classification.
