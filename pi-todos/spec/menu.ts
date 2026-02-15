import type { SelectItem } from "@mariozechner/pi-tui";

export function specItems(closed: boolean, assigned: boolean, showView: boolean): SelectItem[] {
  return [
    { value: "work", label: "work", description: "Work on spec" },
    { value: "review-item", label: "review-item", description: "Review selected spec" },
    ...(closed
      ? [
          { value: "reopen", label: "reopen", description: "Reopen spec" },
          { value: "delete", label: "delete", description: "Delete spec" },
        ]
      : [
          { value: "refine", label: "refine", description: "Refine spec scope" },
          { value: "complete", label: "complete", description: "Mark spec as completed" },
          { value: "abandon", label: "abandon", description: "Mark spec as abandoned" },
        ]),
    ...(closed ? [] : [{ value: "attach-links", label: "attach-links", description: "Attach existing items" }]),
    ...(closed ? [] : [{ value: "validate-links", label: "validate-links", description: "Validate link graph" }]),
    ...(closed ? [] : [{ value: "audit", label: "audit", description: "Audit coherence with AI" }]),
    ...(assigned ? [{ value: "release", label: "release", description: "Release assignment" }] : []),
    ...(showView ? [{ value: "view", label: "view", description: "View spec details" }] : []),
  ];
}
