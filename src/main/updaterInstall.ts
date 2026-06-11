// Pure pieces of the macOS one-click updater, split out so they can be unit
// tested without importing electron. autoUpdate.ts imports these.

const REPO = 'saasmouth/focusbuddy'

// The release asset URL for a given version and arch.
export function macAssetUrl(version: string, arch: string): string {
  return `https://github.com/${REPO}/releases/download/v${version}/Haptyx-${version}-mac-${arch}.zip`
}

// The .app bundle path from the running executable path, or null if we are not
// running from a bundle (dev, or an odd layout).
export function appBundlePath(execPath: string): string | null {
  const m = /^(.*\.app)\//.exec(execPath)
  return m?.[1] ?? null
}

// The swap-and-relaunch helper. It waits for this app (PID) to quit, backs up
// the installed bundle, swaps the freshly downloaded one in with ditto,
// restores the backup if the swap fails, and relaunches either way. Clearing
// the quarantine flag avoids App Translocation pinning the new copy read-only.
// Arguments: $1 = pid, $2 = new app path, $3 = target app path.
export const MAC_INSTALL_SCRIPT = `#!/bin/bash
PID="$1"
NEW_APP="$2"
TARGET_APP="$3"
for i in $(seq 1 200); do
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
  sleep 0.3
done
xattr -cr "$NEW_APP" 2>/dev/null || true
BACKUP="\${TARGET_APP}.bak"
rm -rf "$BACKUP" 2>/dev/null || true
if [ -d "$TARGET_APP" ]; then mv "$TARGET_APP" "$BACKUP"; fi
if ditto "$NEW_APP" "$TARGET_APP"; then
  xattr -cr "$TARGET_APP" 2>/dev/null || true
  open "$TARGET_APP"
  sleep 3
  rm -rf "$BACKUP" 2>/dev/null || true
else
  rm -rf "$TARGET_APP" 2>/dev/null || true
  if [ -d "$BACKUP" ]; then mv "$BACKUP" "$TARGET_APP"; fi
  open "$TARGET_APP"
fi
`
