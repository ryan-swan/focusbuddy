#!/usr/bin/env bash
# Upload the COMPLETE set of mac auto-update assets to a GitHub release, then
# verify the whole release (mac + win) is updatable. Use this instead of a bare
# `gh release upload <zip>` — uploading only the zip is exactly the mistake that
# leaves clients unable to update because latest-mac.yml is absent.
#
# electron-builder writes three mac files into release/ for an arm64 zip target:
#   Haptyx-<v>-mac-arm64.zip            the app payload
#   Haptyx-<v>-mac-arm64.zip.blockmap  differential-update map
#   latest-mac.yml                     the update manifest the updater READS
# All three must be on the release. latest-mac.yml is the one whose absence
# silently breaks updates, so this script refuses to proceed without it.
#
# Usage:  scripts/release-mac.sh <version>     e.g. 2.5.25
# Env:    REPO (default saasmouth/focusbuddy), RELEASE_DIR (default release)
set -euo pipefail

HERE0="$(cd "$(dirname "$0")" && pwd)"
# Version defaults to package.json so it can't drift from what was built.
VERSION="${1:-$(node -p "require('${HERE0}/../package.json').version")}"
REPO="${REPO:-saasmouth/focusbuddy}"
DIR="${RELEASE_DIR:-release}"
TAG="v${VERSION}"

ZIP="${DIR}/Haptyx-${VERSION}-mac-arm64.zip"
BLOCKMAP="${ZIP}.blockmap"
YML="${DIR}/latest-mac.yml"

# Refuse to upload an incomplete set — missing latest-mac.yml is the root cause
# of the update 404s, so treat its absence as a hard error, not a warning.
missing=0
for f in "$ZIP" "$BLOCKMAP" "$YML"; do
  if [ ! -f "$f" ]; then echo "MISSING build artifact: $f" >&2; missing=1; fi
done
if [ "$missing" -ne 0 ]; then
  echo "Build the mac zip first (npm run dist:zip) so all three artifacts exist in ${DIR}/." >&2
  exit 1
fi

# Sanity: the manifest must describe THIS version, otherwise we'd publish a
# manifest that points clients at a different/older zip.
if ! grep -q "version: ${VERSION}" "$YML"; then
  echo "latest-mac.yml does not declare version ${VERSION} — stale build artifact. Rebuild before uploading." >&2
  exit 1
fi

echo "Uploading mac update assets to ${TAG}…"
gh release upload "$TAG" "$ZIP" "$BLOCKMAP" "$YML" --repo "$REPO" --clobber

echo "Running the release completeness gate…"
exec "${HERE0}/verify-release-assets.sh" "$VERSION"
