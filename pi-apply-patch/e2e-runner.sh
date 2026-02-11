#!/usr/bin/env bash
set -euo pipefail

EXT="/home/igorw/Work/pi/pi-extensions-dev/pi-apply-patch/index.ts"
TMPDIR="$(mktemp -d /tmp/pi-apply-patch-e2e.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$TMPDIR"

echo "[1/7] add file"
pi --no-extensions -e "$EXT" -p "Use apply_patch to create file hello.txt with one line: Hello" >/tmp/pi_apply_patch_e2e_1.log
grep -q '^Hello$' hello.txt

echo "[2/7] update file"
printf 'one\ntwo\nthree\n' > update.txt
pi --no-extensions -e "$EXT" -p "Use apply_patch to edit update.txt and replace line 'two' with 'TWO'." >/tmp/pi_apply_patch_e2e_2.log
grep -q '^TWO$' <(sed -n '2p' update.txt)

echo "[3/7] move file"
printf 'mv\n' > old.txt
pi --no-extensions -e "$EXT" -p "Use apply_patch to rename old.txt to moved/new.txt and change content to 'moved'." >/tmp/pi_apply_patch_e2e_3.log
test ! -f old.txt
grep -q '^moved$' moved/new.txt

echo "[4/7] delete file"
printf 'delete-me\n' > delete.txt
pi --no-extensions -e "$EXT" -p "Use apply_patch to delete file delete.txt." >/tmp/pi_apply_patch_e2e_4.log
test ! -f delete.txt

echo "[5/7] malformed patch should fail"
pi --no-extensions -e "$EXT" -p "Call apply_patch with patchText exactly: '*** Begin Patch\n*** Update File: x.txt\n*** End Patch' and then print tool error text." >/tmp/pi_apply_patch_e2e_5.log || true
grep -Eiq "Invalid patch hunk|is empty|Invalid patch" /tmp/pi_apply_patch_e2e_5.log

echo "[6/7] absolute path should fail"
pi --no-extensions -e "$EXT" -p "Call apply_patch with patchText exactly: '*** Begin Patch\n*** Add File: /tmp/abs.txt\n+bad\n*** End Patch' and print the tool error." >/tmp/pi_apply_patch_e2e_6.log || true
grep -Eiq "Absolute paths are not allowed" /tmp/pi_apply_patch_e2e_6.log

echo "[7/7] bash must be blocked"
pi --no-extensions -e "$EXT" -p "You MUST call bash with command 'echo hi'. Then report the exact tool result." >/tmp/pi_apply_patch_e2e_7.log || true
grep -Eiq "bash is disabled in this session" /tmp/pi_apply_patch_e2e_7.log

echo "E2E PASS"

