#!/usr/bin/env bash
#
# Install / reinstall the TTUBOC iMessage watcher as a launchd LaunchAgent.
#
# Prereqs (one-time, manual — see README.md):
#   - Full Disk Access granted to the node binary (or Terminal) so it can read
#     ~/Library/Messages/chat.db.
#   - Node 24 installed; deps installed (`npm install` in this dir).
#   - Firebase creds present in ../../.env.local (FB_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY).
#
# Usage:
#   ./install.sh           # template + copy plist, then bootstrap the agent
#   ./install.sh --uninstall
#
set -euo pipefail

LABEL="com.ttuboc.imessage-watcher"
WATCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$WATCHER_DIR/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

uninstall() {
  echo "Stopping and removing $LABEL ..."
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "Removed $PLIST_DST"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

# Resolve the node binary the watcher should run under (Node 24 required).
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node not found on PATH. Install Node 24 and retry." >&2
  exit 1
fi
NODE_VER="$("$NODE_BIN" --version)"
echo "Using node: $NODE_BIN ($NODE_VER)"
case "$NODE_VER" in
  v24.*) ;;
  *) echo "WARNING: Node 24 is expected; found $NODE_VER. better-sqlite3 is built per-ABI." >&2 ;;
esac

mkdir -p "$WATCHER_DIR/logs"
mkdir -p "$HOME/Library/LaunchAgents"

echo "Templating plist -> $PLIST_DST"
sed -e "s#{{NODE_BIN}}#$NODE_BIN#g" \
    -e "s#{{WATCHER_DIR}}#$WATCHER_DIR#g" \
    "$PLIST_SRC" > "$PLIST_DST"

# Reload cleanly (bootout if already loaded, then bootstrap).
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST"
launchctl enable "gui/$UID_NUM/$LABEL"
launchctl kickstart -k "gui/$UID_NUM/$LABEL"

echo "Installed and started $LABEL."
echo "Tail logs:  tail -f \"$WATCHER_DIR/logs/watcher.out.log\""
