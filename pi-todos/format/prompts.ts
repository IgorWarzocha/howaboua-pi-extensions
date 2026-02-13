import type { ChecklistItem } from "../types.js";

export function buildRefinePrompt(title: string): string {
    return (
        `let's refine task "${title}":\n\n` +
        "You MUST NOT rewrite the todo yet. You MUST ask clear, concrete questions to clarify:\n" +
        "- What files MUST be read?\n" +
        "- What dependencies exist?\n" +
        "- What is the acceptance criteria?\n\n" +
        "You SHOULD research the codebase before asking questions. You MAY ask me for clarification on ambiguous points. " +
        "Wait for my answers before drafting any structured description.\n\n"
    );
}

export function buildCreatePrompt(userPrompt: string): string {
    return (
        "You MUST call the todo tool to create a todo for the following task. Before creating:\n\n" +
        "1. You MUST read relevant files to understand the codebase context\n" +
        "2. You SHOULD research the internet if external knowledge is needed\n" +
        "3. You MUST include a non-empty checklist when creating the todo\n" +
        "4. You MAY ask me clarifying questions if requirements are ambiguous\n\n" +
        "You MUST NOT just create a todo without proper context. You MUST provide actionable checklist items with short IDs (e.g., \"1\", \"2\", \"3\").\n\n" +
        `Task: ${userPrompt}`
    );
}

export function buildEditChecklistPrompt(title: string, checklist: ChecklistItem[], userIntent: string): string {
    const checklistText = checklist.map(item => {
        const status = item.status === "checked" ? "[x]" : "[ ]";
        return `  ${status} ${item.id}: ${item.title}`;
    }).join("\n");
    return (
        `Update the checklist for "${title}" based on this request:\n` +
        `"${userIntent}"\n\n` +
        `Current checklist:\n${checklistText}\n\n` +
        "Use the todo tool's `update` action to modify the checklist array. " +
        "Assign short IDs to new items (e.g., \"1\", \"2\", \"3\")."
    );
}
