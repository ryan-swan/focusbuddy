#!/usr/bin/env bash
# PlexiOffice release completeness gate. The standalone PlexiOffice app publishes
# to the SAME GitHub repo as PlexiDesk but on a distinct update channel, so its
# updater reads office-mac.yml (not PlexiDesk's latest-mac.yml). This script
# asserts that channel's asset set is complete and self-consistent: every office
# asset is publicly reachable, and the sha512 inside office-mac.yml matches the
# binary GitHub actually serves (a mismatch makes electron-updater reject the
# download, an absence makes it 404).
#
# PlexiOffice is mac arm64 only today; when a Windows office build is added, add
# office.yml + the .exe to REQUIRED and a second verify_yml call below.
#
# Usage:  scripts/verify-office-release.sh <version>      e.g. 2.5.70
# Env:    REPO (default saasmouth/focusbuddy)
set -euo pipefail

VERSION="${1:-$(node -p "require('$(cd "$(dirname "$0")/.." && pwd)/package.json').version")}"
REPO="${REPO:-saasmouth/focusbuddy}"
TAG="v${VERSION}"
BASE="https://github.com/${REPO}/releases/download/${TAG}"

REQUIRED=(
  "office-mac.yml"
  "PlexiOffice-${VERSION}-mac-arm64.zip"
  "PlexiOffice-${VERSION}-mac-arm64.zip.blockmap"
)

fail=0
note() { printf '  %s\n' "$1"; }

echo "Verifying PlexiOffice release ${TAG} on ${REPO} (channel: office)"

echo "[1/2] reachability"
for f in "${REQUIRED[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -L "${BASE}/${f}")
  if [ "$code" = "200" ]; then
    note "ok   ${f} (${code})"
  else
    note "MISSING  ${f} (${code})"
    fail=1
  fi
done

verify_yml() {
  local yml="$1"
  local body path sha live
  body=$(curl -s -L "${BASE}/${yml}") || { note "could not fetch ${yml}"; fail=1; return; }
  path=$(printf '%s\n' "$body" | awk '/^path:/{print $2; exit}')
  sha=$(printf '%s\n'  "$body" | awk '/^sha512:/{print $2; exit}')
  if [ -z "$path" ] || [ -z "$sha" ]; then
    note "MALFORMED  ${yml} (no path/sha512)"
    fail=1
    return
  fi
  live=$(curl -s -L "${BASE}/${path}" | openssl dgst -sha512 -binary | openssl base64 -A)
  if [ "$live" = "$sha" ]; then
    note "ok   ${yml} sha512 matches ${path}"
  else
    note "SHA MISMATCH  ${yml} expects ${sha} but ${path} hashes to ${live}"
    fail=1
  fi
}

echo "[2/2] mac metadata integrity"
verify_yml "office-mac.yml"

if [ "$fail" -ne 0 ]; then
  echo
  echo "PLEXIOFFICE RELEASE INCOMPLETE — auto-update would 404 or be rejected. Fix the assets above before calling ${TAG} done."
  exit 1
fi

echo
echo "PLEXIOFFICE RELEASE OK — ${TAG} has a complete, verified updater asset set on the office channel (mac arm64)."
