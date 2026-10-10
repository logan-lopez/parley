#!/usr/bin/env bash
# Builds Parley.app (release) and installs it in ~/Applications (PARLEY_APP_DIR overrides).
#
#   pnpm install:desktop        (from the repo root)
#
# A running Parley isn't touched: the new bundle is swapped in beside it, and the running copy
# keeps its files until you quit it. Quit from the tray and reopen to pick up the new build.
# The installed copy is the one `open -b com.loganlopez.parley` (the server's auto-launch) finds.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_DIR=${PARLEY_APP_DIR:-$HOME/Applications}
BUILT=src-tauri/target/release/bundle/macos/Parley.app
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

pnpm tauri build --bundles app >&2
[[ -d $BUILT ]] || { echo "install: no bundle at $BUILT" >&2; exit 1; }

mkdir -p "$APP_DIR"
# Beside the old one, then swapped in, so a running Parley keeps its files until it quits.
# Moved, not copied: a second bundle with the same identifier left in target/ gets registered
# too, and then `open -b` may launch either.
rm -rf "$APP_DIR/.Parley.app.new"
cp -R "$BUILT" "$APP_DIR/.Parley.app.new"
rm -rf "$BUILT"
"$LSREGISTER" -u "$PWD/$BUILT" 2>/dev/null || true
rm -rf "$APP_DIR/Parley.app"
mv "$APP_DIR/.Parley.app.new" "$APP_DIR/Parley.app"
"$LSREGISTER" -f "$APP_DIR/Parley.app"
echo "installed $APP_DIR/Parley.app" >&2

if pgrep -xq parley; then
  cat >&2 <<NOTE

Parley is running an older build. Quit it from the tray icon, then reopen:
  open "$APP_DIR/Parley.app"
NOTE
else
  cat >&2 <<NOTE

Open it with: open "$APP_DIR/Parley.app"
(Agents' asks also launch it on demand.)
NOTE
fi

cat >&2 <<NOTE
To start Parley at login, add it under System Settings → General → Login Items.
Server changes need their own build: pnpm --filter @parley/server build
NOTE
