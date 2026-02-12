// Marker constants for the patch format.
// This file is intentionally isolated because its string literals
// contain sequences (like triple-star prefixes) that confuse the
// apply_hash tool when used as context lines in update hunks.
// Rarely needs changes — if you need to edit it, delete and recreate.

export const BEGIN_PATCH_MARKER = "\x2a\x2a\x2a Begin Patch";
export const END_PATCH_MARKER = "\x2a\x2a\x2a End Patch";
export const END_PATCH_MARKER_LOOSE = /^\*{2,3}\s*end\s*patch\s*$/i;
export const ADD_FILE_MARKER = "\x2a\x2a\x2a Add File: ";
export const DELETE_FILE_MARKER = "\x2a\x2a\x2a Delete File: ";
export const UPDATE_FILE_MARKER = "\x2a\x2a\x2a Update File: ";
export const MOVE_TO_MARKER = "\x2a\x2a\x2a Move to: ";
export const EOF_MARKER = "\x2a\x2a\x2a End of File";
export const CHANGE_CONTEXT_MARKER = "@@ ";
export const EMPTY_CHANGE_CONTEXT_MARKER = "@@";

const M3 = "\x2a\x2a\x2a";
export const APPLY_PATCH_PROMPT_INSTRUCTIONS = [
  "## apply_hash",
  "",
  "The apply_hash tool MUST be used for all file modifications.",
  "You MUST include all related file modifications for a user request in a single apply_hash call.",
  "You MUST NOT split related edits across sequential apply_hash calls unless the patch is too large to send safely.",
  "If a patch is too large, you MUST split by independent files and explain the split briefly.",
  "",
  "### Patch Envelope Structure",
  "A patch MUST start with a Begin marker and end with an End marker. Between these markers, you MAY include one or more file sections.",
  "",
  `${M3} Begin Patch`,
  "<file section 1>",
  "<file section 2>",
  "...",
  `${M3} End Patch`,
  "",
  "### File Sections",
  "Each section MUST begin with one of the following headers:",
  `- ${M3} Add File: <path>        (Create a new file with the provided '+' prefixed lines)`,
  `- ${M3} Delete File: <path>     (Remove an existing file)`,
  `- ${M3} Update File: <path>     (Modify an existing file using diff hunks)`,
  "",
  "### Atomic Move & Edit",
  "When using Update File, you MAY include a Move marker immediately after the header. This allows you to move/rename a file and apply edits to its content in a single atomic operation.",
  `- ${M3} Move to: <new path>     (MUST follow an Update File header)`,
  "",
  "### Update Hunks",
  "Each update hunk MUST start with @@ (optionally @@ <context>). Hunk lines MUST start with one of the following prefixes:",
  "- ' ' for context",
  "- '-' for removed line",
  "- '+' for added line",
  "",
  "### Example: Multi-File Batch Operation",
  `${M3} Begin Patch`,
  `${M3} Add File: src/new-utility.ts`,
  "+export const util = () => true;",
  "+",
  `${M3} Update File: src/old-name.ts`,
  `${M3} Move to: src/new-name.ts`,
  "@@ import { util }",
  '+import { util } from "./new-utility.js";',
  " ",
  `${M3} Delete File: temp-log.txt`,
  `${M3} End Patch`,
  "",
  "Important:",
  "- You SHALL NOT use the 'edit' or 'write' tools. They are disabled.",
  "- You SHALL NOT use bash for file edits (no sed -i, tee, echo >, printf >, etc.).",
  "- All file paths MUST be relative to the current working directory.",
  "- Every line in an Add File block MUST start with '+'. Use '+' alone for blank lines.",
  "- You MUST prefer one atomic patch call per request.",
  "- You MAY split only when payload size or model limits require it.",
  "- If splitting is required, each call MUST contain a complete file section set for independent files.",
  "- You MUST NOT emit one apply_hash call per tiny edit when one envelope can contain all changes.",
].join("\n");
