export function prdFooter(hasChecklist: boolean): string {
  if (hasChecklist)
    return "Enter confirm • Esc back • v open details • j/k scroll menu • Ctrl+X more options";
  return "Enter confirm • Esc back • v open details • j/k scroll menu • Ctrl+X more options";
}

export function prdLeader(hasChecklist: boolean): string {
  if (hasChecklist) return "More options: e edit PRD checklist";
  return "More options";
}
