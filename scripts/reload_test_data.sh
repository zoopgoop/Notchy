#!/usr/bin/env bash
# Wipes the connected device's Notchy database and repopulates it with the
# fixture data in seed_test_data.py. Requires the app to have been launched
# at least once already (so the schema migrations have run).
#
# Usage: scripts/reload_test_data.sh [device-serial]
set -euo pipefail

PACKAGE="com.zoopgoop.Notchy"
DEVICE="${1:-$(adb devices | awk 'NR==2{print $1}')}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DB="$(mktemp -d)/notchy.db"

if [ -z "$DEVICE" ]; then
  echo "No adb device found." >&2
  exit 1
fi

echo "Using device: $DEVICE"
adb -s "$DEVICE" shell am force-stop "$PACKAGE"

adb -s "$DEVICE" shell run-as "$PACKAGE" cat files/SQLite/notchy.db > "$TMP_DB"

python3 "$SCRIPT_DIR/seed_test_data.py" "$TMP_DB"

adb -s "$DEVICE" push "$TMP_DB" /data/local/tmp/notchy.db > /dev/null
adb -s "$DEVICE" shell run-as "$PACKAGE" cp /data/local/tmp/notchy.db files/SQLite/notchy.db
adb -s "$DEVICE" shell run-as "$PACKAGE" rm -f files/SQLite/notchy.db-wal files/SQLite/notchy.db-shm
adb -s "$DEVICE" shell rm -f /data/local/tmp/notchy.db

adb -s "$DEVICE" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 > /dev/null

echo "Done — Notchy relaunched with fresh test data."
