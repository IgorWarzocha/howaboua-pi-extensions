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
    ...(assigned ? [{ value: "release", label: "release", description: "Release assignment" }] : []),
    ...(showView ? [{ value: "view", label: "view", description: "View spec details" }] : []),
  ];
}

