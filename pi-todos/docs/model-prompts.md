# pi-todos Prompt Catalog

This document enumerates model-facing prompts emitted by `pi-todos`.

Each entry uses the REQUIRED structure:

- where present
- type
- prompt content

## Entry 1

- where present:
  - `pi-todos/gui/create-prompt.ts` (`buildCreateBase`)
- type:
  - create-base
- prompt content:

```text
Procedure requirements:
1. You MUST use this command prefix for plan creation: PI_TODOS_CWD="<cwd>" <cli>
2. You MUST start by running: PI_TODOS_CWD="<cwd>" <cli> -schema <type>
3. You MUST read schema output and satisfy every REQUIRED field.
4. You MUST use the same command prefix to execute create.
5. After create, you MUST edit markdown body sections only unless the user explicitly requests frontmatter updates.
6. You MUST preserve existing frontmatter arrays by merging entries when link updates are required.
7. You MUST assume this may run in a fresh session with no prior context.
8. You MUST use document type terminology (PRD, spec, todo). You MAY encounter legacy 'kind' fields; treat them as equivalent to 'type'.
9. You MAY ask clarifying questions when requirements are ambiguous.

<rules>

User request: <userPrompt>
```

## Entry 2

- where present:
  - `pi-todos/prd/create.ts` (`buildCreatePrdPrompt`)
- type:
  - create-prd
- prompt content:

```text
<create-base prompt>

Rules payload:
You MUST produce a PRD type document that captures product objective, user problem, scope boundaries, non-goals, constraints, deliverables, and testable acceptance criteria.
```

## Entry 3

- where present:
  - `pi-todos/spec/create.ts` (`buildCreateSpecPrompt`)
- type:
  - create-spec
- prompt content:

```text
<create-base prompt>

Rules payload (when PRDs selected):
Attach this spec to these PRDs and treat them as required context:
- <prd path>
...

You MUST read every listed PRD file before drafting or creating the spec.

You MUST update the new spec frontmatter links.prds to include every selected PRD path (repo-relative) and set links.root_abs.

After creating the spec, you MUST update each listed PRD frontmatter links.specs to include the new spec path (repo-relative).

You MUST preserve and merge existing links arrays; you MUST NOT overwrite existing linked entries.

You MUST produce a spec type document that defines technical design, interfaces, constraints, edge cases, and deterministic verification criteria. You MUST keep lifecycle user-controlled. You MUST maximize cross-links between related PRD/spec/todo items so relationships form a complete web.

Rules payload (when no PRDs selected):
No PRD attachments were selected. This is a standalone spec.

You MUST produce a spec type document that defines technical design, interfaces, constraints, edge cases, and deterministic verification criteria. You MUST keep lifecycle user-controlled. You MUST maximize cross-links between related PRD/spec/todo items so relationships form a complete web.
```

## Entry 4

- where present:
  - `pi-todos/todo/create.ts` (`buildCreateTodoPrompt`)
- type:
  - create-todo
- prompt content:

```text
<create-base prompt>

Rules payload (when PRDs/specs selected):
Attach this todo to selected parent plans and treat them as required context:
- PRD: <prd path>
- Spec: <spec path>
...

You MUST read every listed parent plan file before drafting or creating the todo.

You MUST update the new todo frontmatter links.prds/specs to include every selected parent path (repo-relative) and set links.root_abs.

After creating the todo, you MUST update each listed parent frontmatter links.todos to include the new todo path (repo-relative).

You MUST preserve and merge existing links arrays; you MUST NOT overwrite existing linked entries.

You MUST produce a todo type document with a non-empty checklist using short IDs and done booleans. Checklist items MUST be concrete execution steps required to complete the task. Checklist items MUST include observable outcomes and MUST NOT use generic placeholders. You MUST NOT close lifecycle state automatically. You MUST maximize cross-links between related PRD/spec/todo items so relationships form a complete web.

Rules payload (when no parents selected):
No parent plans were selected. This is a standalone todo.

You MUST produce a todo type document with a non-empty checklist using short IDs and done booleans. Checklist items MUST be concrete execution steps required to complete the task. Checklist items MUST include observable outcomes and MUST NOT use generic placeholders. You MUST NOT close lifecycle state automatically. You MUST maximize cross-links between related PRD/spec/todo items so relationships form a complete web.
```

## Entry 5

- where present:
  - `pi-todos/format/prompts.ts` (`buildTodoRefinePrompt`)
- type:
  - refine-todo
- prompt content:

```text
Refine todo at path "<filePath>" (title: "<title>").

You MUST read these files before making changes:
- <filePath>
- <resolved linked path>
...

You MUST ask targeted clarifying questions when requirements are ambiguous.
You MUST identify concrete execution steps that are required to complete this task.
You MUST update the todo file directly after clarification.
You MUST write a checklist with actionable steps; generic placeholders MUST NOT be used.
Each checklist item MUST describe one observable action with a verifiable outcome.
```

## Entry 6

- where present:
  - `pi-todos/format/prompts.ts` (`buildPrdRefinePrompt`)
- type:
  - refine-prd
- prompt content:

```text
Refine PRD at path "<filePath>" (title: "<title>").

You MUST read these files before making changes:
- <filePath>
- <resolved linked path>
...

You MUST ask targeted clarifying questions when requirements are ambiguous.
You MUST improve product framing: objective, non-goals, users, constraints, and acceptance criteria.
Acceptance criteria MUST be explicit, testable, and user-observable.
You MUST update the PRD file directly after clarification.
```

## Entry 7

- where present:
  - `pi-todos/format/prompts.ts` (`buildSpecRefinePrompt`)
- type:
  - refine-spec
- prompt content:

```text
Refine spec at path "<filePath>" (title: "<title>").

You MUST read these files before making changes:
- <filePath>
- <resolved linked path>
...

You MUST ask targeted clarifying questions when requirements are ambiguous.
You MUST improve technical precision: architecture decisions, interfaces, edge cases, and validation strategy.
Verification criteria MUST be deterministic and implementation-ready.
You MUST update the spec file directly after clarification.
```

## Entry 8

- where present:
  - `pi-todos/format/prompts.ts` (`buildTodoWorkPrompt`)
- type:
  - work-todo
- prompt content:

```text
Work on todo at path "<filePath>" (title: "<title>").

You MUST read these files before making changes:
- <filePath>
- <resolved linked path>
...

You MUST execute checklist steps in order unless dependencies require reordering.
As work progresses, you MUST edit ONLY frontmatter fields in this todo file (checklist/status/links/assignment fields as needed).
You MUST NOT write progress notes into the markdown body during work execution.
Goal: complete this todo document to 100%. You MUST NOT stop after partial progress, and you MUST continue until all required steps are done.
You MUST ensure linked PRD/spec/todo markdown files remain a complete bidirectional link web.
```

## Entry 9

- where present:
  - `pi-todos/format/prompts.ts` (`buildPrdWorkPrompt`)
- type:
  - work-prd
- prompt content:

```text
Work on PRD at path "<filePath>" (title: "<title>").

You MUST read these files before making changes:
- <filePath>
- <resolved linked path>
...

You MUST focus on product definition quality and requirement clarity.
As work progresses, you MUST edit ONLY frontmatter fields in this PRD file (checklist/status/links/assignment fields as needed).
You MUST NOT write progress notes into the markdown body during work execution.
Goal: complete this PRD document to 100%. You MUST NOT stop after partial progress, and you MUST continue until all required steps are done.
You MUST preserve intent consistency across linked specs and todos.
```

## Entry 10

- where present:
  - `pi-todos/format/prompts.ts` (`buildSpecWorkPrompt`)
- type:
  - work-spec
- prompt content:

```text
Work on spec at path "<filePath>" (title: "<title>").

You MUST read these files before making changes:
- <filePath>
- <resolved linked path>
...

You MUST focus on deterministic technical behavior and implementation constraints.
As work progresses, you MUST edit ONLY frontmatter fields in this spec file (checklist/status/links/assignment fields as needed).
You MUST NOT write progress notes into the markdown body during work execution.
Goal: complete this spec document to 100%. You MUST NOT stop after partial progress, and you MUST continue until all required steps are done.
You MUST preserve consistency with linked PRDs and implementation todos.
```

## Entry 11

- where present:
  - `pi-todos/format/prompts.ts` (`buildTodoReviewPrompt`)
- type:
  - review-todo
- prompt content:

```text
<work-todo prompt>

Then review implementation completeness, unresolved gaps, and missing link relationships.
```

## Entry 12

- where present:
  - `pi-todos/format/prompts.ts` (`buildPrdReviewPrompt`)
- type:
  - review-prd
- prompt content:

```text
<work-prd prompt>

Then review product requirement completeness and unresolved gaps.
```

## Entry 13

- where present:
  - `pi-todos/format/prompts.ts` (`buildSpecReviewPrompt`)
- type:
  - review-spec
- prompt content:

```text
<work-spec prompt>

Then review technical completeness, edge-case coverage, and unresolved gaps.
```

## Entry 14

- where present:
  - `pi-todos/format/prompts.ts` (`buildEditChecklistPrompt`)
- type:
  - edit-checklist
- prompt content:

```text
Update the checklist in file "<filePath>" (title: "<title>") based on this request:
"<userIntent>"

You MUST read these files before making changes:
- <filePath>

Current checklist:
  [ ] 1: <item title>
  [x] 2: <item title>
  ...

You MUST keep existing frontmatter fields stable.
You MUST write checklist items as concrete actions required to complete the task.
Generic checklist items MUST NOT be used.
```

## Entry 15

- where present:
  - `pi-todos/format/prompts.ts` (`buildValidateAuditPrompt`)
- type:
  - audit
- prompt content:

```text
Perform an audit on the following item:
<currentPath>

Requirements:
1. You MUST treat this as an audit-only task. You MUST NOT edit any files.
2. You MUST read every listed file before producing findings.
3. You MUST verify frontmatter link integrity across PRD/spec/todo items: bidirectional links, type-correct buckets, root_abs presence when repo-relative links exist, missing or broken linked files, duplicate or stale links.
4. You MUST verify cross-document consistency: requirement coverage across PRD -> spec -> todo, contradictory statements, missing implementation tasks for required spec behavior, orphaned or obsolete items.
5. You MUST separate deterministic facts from judgment calls.
6. You MUST output a short Executive Summary first.
7. You MUST output one findings table with these exact columns: type | name | issue (3-5 words).
8. You MUST include only issues in the table.
9. After the table, you MUST output a markdown bullet list named 'Proposed Changes' with concrete recommended changes/questions.
10. You MAY ask clarifying questions only if a blocking ambiguity prevents assessment.

Audit scope (absolute paths):
- <absolute path>
...
```
