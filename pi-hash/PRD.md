### Hashline Protocol PRD

#### 1. Hashing Logic (The Source of Truth)
The hashing logic MUST be stable, collision-resistant for single lines, and immune to minor formatting hallucinations.

**Normalization (REQUIRED):**
Before hashing, a line MUST be processed through:
1. **Unicode Normalization:** Convert "smart" quotes, em-dashes, and non-breaking spaces to their standard ASCII equivalents (using the "Banger" logic from `pi-apply-patch`).
2. **Whitespace Stripping:** Remove ALL whitespace (`\s+`) and carriage returns (`\r`).
3. **Case Sensitivity:** Content hashing MUST be case-sensitive to preserve code semantics.

**Algorithm:**
1. **Function:** `xxHash32(normalized_content)`.
2. **Output:** Truncate to 1 byte (`% 256`) and return as a **2-character lowercase hex string** (`00-ff`).

#### 2. Read Tool (The Enhanced View)
The `read` tool MUST be a full replacement (based on `pi-enforce-read`) that enforces the Hashline format.

**Functional Requirements:**
1. **Protocol Injection:** Every line of output MUST be prefixed with `LINE:HASH|`.
2. **Grep-in-Tool (Banger):**
   - Supports `search`, `regex`, and `caseSensitive` parameters.
   - Returns sparse matches with `contextBefore` and `contextAfter`.
   - **Critical:** Every line in a search result (including context) MUST include its hash.
3. **Multi-Path Support:** Batch multiple file reads into a single tool result to reduce turns.
4. **UI Safety:** Automatically signal the TUI to collapse large read outputs by default.
5. **Bash Blocking:** Intercept the `bash` tool and block `cat`, `head`, `tail`, `sed -n ...p`, etc., to prevent protocol bypass.

#### 3. Destructive Operations Tool (`apply_hash`)
The `apply_hash` tool replaces `apply_patch`, `edit`, and `write`. It MUST handle multi-file atomic transactions.

**Tool Schema:**
Accepts a `patch` envelope containing an array of operations:
- **`set_line(anchor, text)`**: Replace a specific line.
- **`replace_range(start_anchor, end_anchor, text)`**: Replace a block.
- **`insert_after(anchor, text)`**: Insert code after a line.
- **`delete(anchor | range)`**: Remove lines.
- **`add_file(path, content)`**, **`move_file(from, to)`**, **`delete_file(path)`**: Standard file-system operations.

**The "Relocation" Engine (Banger):**
1. If an `anchor` (e.g., `10:a3`) has a mismatch (content at line 10 is not `a3`):
   - Search a window of +/- 100 lines for the hash `a3`.
   - If a **unique** match is found, automatically apply the edit at the new location.
   - If multiple or zero matches found, fail and return the "Recovery" block.

**Safety & Cleanup:**
1. **Atomic Commit:** If any operation in the batch fails (and cannot be relocated), the entire turn's file changes MUST be aborted.
2. **Hallucination Stripping:** Proactively strip `LINE:HASH|` or `+` prefixes from the model's `text` input.
3. **Indention Inheritance:** If the model provides replacement text without indentation, it SHOULD inherit the indentation of the anchor line.
4. **Bash Write Guard:** Block `echo >`, `tee`, `sed -i`, etc., via the `bash` tool.

**Recovery Protocol:**
On failure, return a "Quick Fix" block:
```
Hash mismatch at 10:a3.
Actual state:
9:f2| ...
10:b1| [Actual Content]
11:c4| ...
```
This allows the model to immediately correct its anchors without a full re-read.

