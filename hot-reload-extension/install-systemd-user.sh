#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SRC="$SCRIPT_DIR/systemd/pi-hot-reloadd.service"
SERVICE_DST="$HOME/.config/systemd/user/pi-hot-reloadd.service"

mkdir -p "$HOME/.config/systemd/user"
cp "$SERVICE_SRC" "$SERVICE_DST"

systemctl --user daemon-reload
systemctl --user enable --now pi-hot-reloadd.service
systemctl --user status --no-pager pi-hot-reloadd.service || true

echo "Installed: $SERVICE_DST"
echo "Socket/state/log in: \
  ${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
