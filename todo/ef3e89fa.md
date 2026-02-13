{
  "id": "ef3e89fa",
  "title": "[Phase 1] Self-healing: Hash relocation for moved lines",
  "tags": [
    "pi-hash",
    "phase-1",
    "self-healing",
    "hash-relocation"
  ],
  "status": "closed",
  "created_at": "2026-02-12T21:22:15.110Z",
  "assigned_to_session": "5d994b6f-5c75-4f28-8a94-ed305756b8c1"
}

## Completed

Hash relocation for moved lines has been implemented in apply.ts.

### Implementation

1. **`buildUniqueLineByHash()` function** (lines 87-101)
   - Builds a map of hash → line number for lines that are unique in the file
   - Lines with duplicate hashes are excluded from the map (to prevent wrong relocation)

2. **Modified `locate()` function** (lines 102-142)
   - Now accepts `uniqueLineByHash: Map<string, number>` parameter
   - When spiral search fails, looks up the first anchor's hash in the map
   - If found and unique, tries to match the chunk at that location
   - If chunk matches, returns the relocated position

3. **Modified `computeReplacements()` function** (line 212)
   - Builds the `uniqueLineByHash` map at the start
   - Passes it to `locate()` for each chunk

### How It Works

When an edit is attempted with a stale anchor:
1. First, the existing spiral search is tried (+/- 100 lines)
2. If no match is found, the hash is looked up in `uniqueLineByHash`
3. If the hash is unique in the file, the chunk is matched at that location
4. If the chunk matches, the edit succeeds at the relocated position
5. If the chunk doesn't match (content changed) or hash is not unique, the error is thrown

### Acceptance Criteria Met

- [x] Line moved up/down: edit succeeds with old anchor
- [x] Duplicate hashes: no wrong relocation (duplicates excluded from map)
- [x] Error message shows relocation attempt (through existing error handling)
