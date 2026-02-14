export function prdFooter(hasChecklist: boolean): string {
  if (hasChecklist) return "Enter confirm • Esc back • v toggle preview • j/k scroll preview • Ctrl+X leader (then e edit PRD checklist)";
  return "Enter confirm • Esc back • v toggle preview • j/k scroll preview • Ctrl+X leader";
}

export function prdLeader(hasChecklist: boolean): string {
  if (hasChecklist) return "Leader: w work • y review • r refine • c complete • a abandon • v toggle preview • e edit PRD checklist • x cancel";
  return "Leader: w work • y review • r refine • c complete • a abandon • v toggle preview • x cancel";
}

