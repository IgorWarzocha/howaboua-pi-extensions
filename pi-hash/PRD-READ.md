### PRD: Hashline-Enforced Read Tool

#### 1. Purpose
Provide the agent with a view of the workspace where every line is uniquely addressable via a `LINE:HASH` anchor.

**Context for Implementation:**
The read tool is the primary way the model gathers "anchors." It MUST be precise. We are integrating our "Banger" in-tool search (grep) feature so the model can find lines quickly, but we must ensure these sparse search results still provide hashes so they can be immediately used for editing.

**Reference Files:**
- `pi-extensions-dev/pi-enforce-read/read-executor.ts`: Source for the in-tool search/grep logic and multi-file handling.
- `pi-extensions-dev/pi-enforce-read/guard.ts`: Logic for blocking unauthorized bash file reads (cat/head/tail).

#### 2. Functional Requirements

**1. Output Formatting:**
- Every line returned to the model MUST follow the format: `LINE:HASH|CONTENT`.
- Example: `42:a3|  const x = 10;`

**2. Integrated Search (Banger):**
- **Feature:** In-tool `grep` with `search`, `regex`, and `caseSensitive` parameters.
- **Context:** MUST support `contextBefore` and `contextAfter` line counts.
- **Hash Integrity:** Search results MUST NOT omit hashes. Every displayed line (match or context) MUST include its `LINE:HASH|` prefix.

**3. Protocol Enforcement:**
- **Bash Blocking:** Intercept the `bash` tool. Block commands that read files directly (e.g., `cat`, `head`, `tail`, `sed -n ...p`, `grep`).
- **Reasoning:** Prevents the model from obtaining "hash-less" code, which would lead to `apply_hash` failures.

**4. Performance & UX:**
- **Multi-Read:** Support reading an array of files in one tool call.
- **TUI Integration:** Automatically collapse large outputs in the TUI to keep the terminal clean.

*** Add File: pi-extensions-dev/pi-hash/PRD-APPLY.md
### PRD: Atomic Hash-Anchored Mutation Tool (`apply_hash`)

#### 1. Purpose
A high-reliability, multi-file mutation tool that uses hashes to ensure targeted edits land on the intended content even if line numbers shift.

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
