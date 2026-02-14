import type { SelectItem } from "@mariozechner/pi-tui";

export function todoItems(closed: boolean, assigned: boolean, showView: boolean): SelectItem[] {
  return [
    { value: "work", label: "work", description: "Work on todo" },
    { value: "review-item", label: "review-item", description: "Review selected todo" },
    ...(closed
      ? [
          { value: "reopen", label: "reopen", description: "Reopen todo" },
          { value: "delete", label: "delete", description: "Delete todo" },
        ]
      : [
          { value: "refine", label: "refine", description: "Refine todo scope" },
          { value: "complete", label: "complete", description: "Mark todo as completed" },
          { value: "abandon", label: "abandon", description: "Mark todo as abandoned" },
        ]),
    ...(closed ? [] : [{ value: "attach-links", label: "attach-links", description: "Attach existing items" }]),
    ...(assigned ? [{ value: "release", label: "release", description: "Release assignment" }] : []),
    ...(showView ? [{ value: "view", label: "view", description: "View todo details" }] : []),
  ];
}
