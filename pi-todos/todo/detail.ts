export function todoFooter(hasChecklist: boolean): string {
  if (hasChecklist) return "Enter confirm • Esc back • v toggle preview • j/k scroll preview • Ctrl+X leader (then e edit todo checklist)";
  return "Enter confirm • Esc back • v toggle preview • j/k scroll preview • Ctrl+X leader";
}

export function todoLeader(hasChecklist: boolean): string {
  if (hasChecklist) return "Leader: w work • y review • r refine • c complete • a abandon • v toggle preview • e edit todo checklist • x cancel";
  return "Leader: w work • y review • r refine • c complete • a abandon • v toggle preview • x cancel";
}

