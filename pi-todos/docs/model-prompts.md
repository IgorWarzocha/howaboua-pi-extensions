# Todo Extension Model Prompts
This file lists the exact prompt text emitted by the todo extension, with placeholders where runtime values are inserted.

## 1) `buildCreatePrompt(userPrompt)`

```text
You MUST create or update plan files directly for the following task. Before creating:

1. You MUST read relevant files to understand the codebase context
2. You SHOULD research the internet if external knowledge is needed
3. You MUST include a non-empty checklist when creating todo-kind plan files
4. You MAY ask me clarifying questions if requirements are ambiguous

You MUST NOT create files without proper context. You MUST provide actionable checklist items with short IDs (e.g., "1", "2", "3") when checklist is required.

Task: <userPrompt>
```

### Create-mode prefixing done before `buildCreatePrompt(...)`

- Tasks tab input: `<user input>`
- PRDs tab input: `Create a PRD document. <user input>`
- Specs tab input: `Create a spec document. <user input>`

## 2) `buildRefinePrompt(title)`

```text
let's refine task "<title>":

You MUST NOT rewrite the todo yet. You MUST ask clear, concrete questions to clarify:
- What files MUST be read?
- What dependencies exist?
- What is the acceptance criteria?

You SHOULD research the codebase before asking questions. You MAY ask me for clarification on ambiguous points. Wait for my answers before drafting any structured description.
```

## 3) `buildWorkPrompt(title, links)`

When no resolved linked files exist:

```text
work on todo "<title>"
```

When resolved linked files exist:

```text
work on todo "<title>"

You MUST read these files before making changes:
- <absolute path 1>
- <absolute path 2>
- ...
```

## 4) `buildReviewPrompt(title, links)`

This is exactly `buildWorkPrompt(title, links)` plus:

```text

Then review whether implementation is complete and list gaps.
```

## 5) `buildEditChecklistPrompt(title, checklist, userIntent)`

```text
Update the checklist for "<title>" based on this request:
"<userIntent>"

Current checklist:
  [ ] 1: <item title>
  [x] 2: <item title>
  ...

Edit the markdown frontmatter checklist directly and keep existing fields stable. Assign short IDs to new items (e.g., "1", "2", "3").
```
