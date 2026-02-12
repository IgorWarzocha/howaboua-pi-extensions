### PRD: Atomic Hash-Anchored Mutation Tool (`apply_hash`)

#### 1. Purpose
A high-reliability, multi-file mutation tool that uses hashes to ensure targeted edits land on the intended content even if line numbers shift.

**Context for Implementation:**
This tool replaces the fragile unified diff format. It uses the "Relocation Engine" to find lines that have moved, making it significantly more robust than standard `str_replace`. We MUST preserve the atomic multi-file operations (Add/Move/Delete) from our existing patch extension to support complex refactors.

**Reference Files:**
- `pi-extensions-dev/pi-apply-patch/src/apply.ts`: Logic for multi-file operations and the `deriveUpdatedContent` structure.
- `pi-extensions-dev/pi-apply-patch/src/parser.ts`: Logic for parsing the atomic "Begin Patch" envelope.

#### 2. Operations (The Envelope)
The tool accepts a batch of operations to ensure atomicity:

**Line-Level (Update):**
- `set_line(anchor, text)`: Replace a single anchored line.
- `replace_range(start_anchor, end_anchor, text)`: Replace a block of code.
- `insert_after(anchor, text)`: Append content after a specific anchor.

**File-Level:**
- `add_file(path, content)`
- `move_file(from_path, to_path)`
- `delete_file(path)`

#### 3. The Relocation Engine (Advanced Banger)
If an operation targets `10:a3` but line 10 no longer matches `a3`:
1. The engine MUST scan a window of +/- 100 lines.
2. If the hash `a3` is found at line 12 and is **unique** within the search window, the engine MUST relocate the edit to line 12 automatically.
3. If relocation fails (no match or ambiguous matches), the tool MUST abort the entire turn's batch.

#### 4. Safety & Heuristics
- **Bash Write Guard:** Block `echo >`, `tee`, and `sed -i` via the `bash` tool.
- **Indentation Inheritance:** Replacement text SHOULD inherit the leading whitespace of the anchor line if the model omits it.
- **Hallucination Cleaning:** Proactively strip common LLM errors from input `text` (e.g., repeating the `LINE:HASH|` prefix or diff `+` markers).

#### 5. Failure Recovery
On mismatch/relocation failure, return a "Quick Fix" payload:
- Show the `Actual State` (line number and actual hash) for the lines immediately surrounding the failed anchor.
- This allows the model to "re-anchor" without needing to perform a full `read` call.
