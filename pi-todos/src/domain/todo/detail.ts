export function todoFooter(hasChecklist: boolean): string {
  if (hasChecklist)
    return "Enter confirm • Esc back • v open details • j/k scroll menu • Ctrl+X more options";
  return "Enter confirm • Esc back • v open details • j/k scroll menu • Ctrl+X more options";
}

export function todoLeader(hasChecklist: boolean): string {
  if (hasChecklist) return "More options: e edit todo checklist";
  return "More options";
}
