export function specFooter(hasChecklist: boolean): string {
  if (hasChecklist)
    return "Enter confirm • Esc back • v toggle preview • j/k scroll menu • Shift + j/k scroll preview • Ctrl+X more options";
  return "Enter confirm • Esc back • v toggle preview • j/k scroll menu • Shift + j/k scroll preview • Ctrl+X more options";
}

export function specLeader(hasChecklist: boolean): string {
  if (hasChecklist) return "More options: e edit spec checklist";
  return "More options";
}
