 1:90|# pi-hash

 Pi extension providing a high-reliability "Relocation Engine" for file edits using line-based anchored hashing. It replaces standard `read`/`edit` tools with robust versions that ensure edits land exactly where intended, even if files have drifted.

 ## Core Protocol: The Hashline

 Every line in the system is uniquely addressed via a `LINE:HASH` anchor.
 - **Format**: `LINE:HASH|CONTENT` (e.g., `42:a3bc|const x = 10;`).
 - **Hashing**: Uses FNV-1a (32-bit) mapped to a 4-character lowercase base26 string (`aaaa`-`zzzz`).
 - **Normalization**: Lines are normalized before hashing (Unicode NFC, smart quote conversion, and absolute whitespace stripping) to ensure format-invariant stability.

 ## Tools

 ### `read` (Enforced Hashing)
 - **Hashed Output**: All file reads return anchored lines.
 - **Integrated Grep**: High-performance search with `regex`, `caseSensitive`, and context (`contextBefore`/`contextAfter`) support.
 - **Multi-Read**: Batch reading of multiple files in a single call.
 - **Safety**: Intercepts `bash` commands like `cat`, `head`, and `tail` to prevent the ingestion of "hash-less" code.

 ### `apply_patch` (The Relocation Engine)
 - **Spiral Search**: If a target line drifts, the engine performs an outward-expanding search (+/- 100 lines) to find the correct anchor.
 - **Cumulative Drift**: Automatically adjusts target lines for multiple hunks in a single file by tracking net line-count shifts.
 - **Transactional Integrity**: Per-file atomic application. If any hunk fails to relocate or verify, the entire file operation is rolled back.
 - **Live Sync**: Tool results return updated anchors for all modified blocks, allowing the model to continue editing without re-reading.

 ## Security: Bash Guards

 The extension implements proactive guards to enforce the hashing protocol:
 - **Read Guard**: Blocks shell commands that bypass `read` (e.g., `grep`, `sed -n`).
 - **Write Guard**: Blocks direct file mutations (e.g., `echo >`, `tee`, `sed -i`) to ensure all changes go through the relocation engine.

 ## Installation

 Symlink the extension directory into your `.pi/extensions` folder.
