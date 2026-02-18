import type { SelectItem } from "@mariozechner/pi-tui";

export function prdItems(
  closed: boolean,
  assigned: boolean,
  jump: boolean,
  showView: boolean,
): SelectItem[] {
  return [
    { value: "work", label: "work", description: "Work on PRD" },
    { value: "review-item", label: "review-item", description: "Review selected PRD" },
    ...(closed
      ? [
          { value: "reopen", label: "reopen", description: "Reopen PRD" },
          { value: "delete", label: "delete", description: "Delete PRD" },
        ]
      : [
          { value: "refine", label: "refine", description: "Refine PRD scope" },
          { value: "complete", label: "complete", description: "Mark PRD as completed" },
          { value: "abandon", label: "abandon", description: "Mark PRD as abandoned" },
        ]),
    ...(closed
      ? []
      : [{ value: "attach-links", label: "attach-links", description: "Attach existing items" }]),
    ...(closed
      ? []
      : [{ value: "validate-links", label: "validate-links", description: "Validate link graph" }]),
    ...(closed ? [] : [{ value: "audit", label: "audit", description: "Audit coherence with AI" }]),
    ...(assigned
      ? []
      : [{ value: "assign", label: "assign", description: "Assign to this session" }]),
    ...(assigned
      ? [{ value: "release", label: "release", description: "Release assignment" }]
      : []),
    ...(jump
      ? [{ value: "go-to-session", label: "go-to-session", description: "Go to assigned session" }]
      : []),
    ...(showView ? [{ value: "view", label: "view", description: "View PRD details" }] : []),
  ];
}
