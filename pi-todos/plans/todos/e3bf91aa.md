---
id: e3bf91aa
kind: todo
title: Gate internal cli execution
tags:
  - cli
  - guard
  - internal
status: open
created_at: 2026-02-14T13:14:00.000Z
modified_at: 2026-02-14T13:14:00.000Z
assigned_to_session: null
agent_rules: "MUST block direct model invocation. MUST enforce internal invocation argument. MUST provide explicit remediation text on failure."
links:
  root_abs: /home/igorw/Work/pi/pi-extensions-dev/pi-todos
  prds:
    - plans/prds/a1f49c2e.md
  specs:
    - plans/specs/c93a0b57.md
  todos: []
  reads:
    - plans/prds/a1f49c2e.md
    - plans/specs/c93a0b57.md
checklist:
  - title: Add internal invocation argument parser
    done: true
  - title: Add unauthorized invocation guard
    done: true
  - title: Add deterministic blocked-call response payload
    done: true
template: true
---

## Objective

Implement internal-only CLI invocation controls so models cannot call planning CLI commands directly.

## Scope

- invocation argument enforcement
- unauthorized call rejection
- deterministic response formatting
- repository discovery and branch naming for worktree creation

## Non-Goals

- exposing new model-facing command surfaces
- lifecycle state automation

## Constraints

- fail fast on missing internal invocation argument
- preserve stable response schema
- branch names MUST follow feat/prd-<slug> or feat/todo-<slug>
- if no repository exists, UI MUST offer repository initialization

## Deliverables

- invocation guard implementation
- blocked-call response implementation

## Acceptance Criteria

- direct calls fail with explicit guidance
- internal calls succeed from extension layer

## Risks

- false negatives may block valid internal calls
- weak guard logic may allow bypass

## Implementation Notes

Keep argument naming single-word and stable to avoid accidental drift.
Treat this file as a template blueprint for generated todo files.

## Verification Plan

Run positive and negative invocation tests and validate response determinism.

