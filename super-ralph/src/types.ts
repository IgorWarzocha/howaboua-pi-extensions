export const RALPH_DIR = ".ralph";
export const STATE_ENTRY = "super-ralph-state";
export const COMPLETE_MARKER = "<ralph>COMPLETE</ralph>";

export interface RalphState {
    active: boolean;
    name: string;
    taskFile: string;
    iteration: number;
    maxIterations: number;
    reflectEvery: number;
    untilCondition?: string;
    prompt?: string;
    steering: string[];
    summary?: string;
}

export const SUMMARY_SYSTEM_PROMPT = `You summarize the current iteration goal of a development loop for a status bar.
Return a concise phrase (max 5 words). Plain text only. No punctuation.
Example: "Fixing tests", "Refactoring auth", "Writing docs"`;
