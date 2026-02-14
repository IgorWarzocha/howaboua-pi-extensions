import type { SelectItem } from "@mariozechner/pi-tui";

export function prdItems(closed: boolean, assigned: boolean, showView: boolean): SelectItem[] {
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
    ...(closed ? [] : [{ value: "attach-links", label: "attach-links", description: "Attach existing items" }]),
    ...(assigned ? [{ value: "release", label: "release", description: "Release assignment" }] : []),
    ...(showView ? [{ value: "view", label: "view", description: "View PRD details" }] : []),
  ];
}
