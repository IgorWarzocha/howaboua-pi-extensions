{
  "id": "dcdfa48c",
  "title": "[Phase 3] PI-TODOS: Evaluate OpenCode Planning Toolkit features",
  "tags": [],
  "status": "open",
  "created_at": "2026-02-12T00:26:49.071Z"
}

Research and evaluate features from `opencode-planning-toolkit` for potential porting to pi-todos.

## Prerequisite
This is a research task. MUST read the OpenCode toolkit implementation first.

## Files to Analyze
- `pi-extensions-dev/opencode-planning-toolkit/` directory
- Key files: tools/*.ts, utils.ts, skills/plans-and-specs/SKILL.md

## Evaluation Criteria

### Features to Evaluate
1. **Specs system** - reusable specifications linked to plans
2. **Prompt engineering** - RFC 2119 usage patterns
3. **File organization** - docs/specs/, docs/plans/ structure
4. **Validation** - name validation, security checks
5. **Plan format** - frontmatter structure, required fields

### Decision Matrix
For each feature, determine:
- **Port** - Add to pi-todos (specify which phase)
- **Partial** - Adapt concept but simplified
- **Skip** - Not applicable or too complex

## Output
After research, create specific implementation todos for features worth porting. This todo itself should be closed once evaluation is complete.

## Acceptance Criteria
- [ ] Read all OpenCode toolkit source files
- [ ] Document which features are worth porting
- [ ] Create new specific todos for ported features
- [ ] Close this todo when evaluation complete
