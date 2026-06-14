#!/usr/bin/env bash
# Release completeness gate. A Haptyx desktop release is NOT done until this
# script exits 0. It exists because the auto-updater silently 404s when the
# per-platform update metadata is missing: electron-updater reads latest-mac.yml
# (mac) / latest.yml (win) from the newest GitHub release, and a release that
# ships only the installer binary leaves every client unable to update.
#
# For the given version it asserts that the GitHub release carries the FULL
# updater asset set for both platforms, that each metadata file is publicly
# reachable, and that the sha512 inside each metadata file matches the binary
# GitHub actually serves (a mismatch makes electron-updater reject the download).
#
# Usage:  scripts/verify-release-assets.sh <version>      e.g. 2.5.25
# Env:    REPO (default saasmouth/focusbuddy)
set -euo pipefail

# Version defaults to package.json so it can't drift from what was built.
VERSION="${1:-$(node -p "require('$(cd "$(dirname "$0")/.." && pwd)/package.json').version")}"
REPO="${REPO:-saasmouth/focusbuddy}"
TAG="v${VERSION}"
BASE="https://github.com/${REPO}/releases/download/${TAG}"

# Required assets. The .yml files are the ones whose absence breaks updates; the
# binaries + blockmaps are what they point at.
REQUIRED=(
  "latest-mac.yml"
  "Haptyx-${VERSION}-mac-arm64.zip"
  "Haptyx-${VERSION}-mac-arm64.zip.blockmap"
  "latest.yml"
  "Haptyx-${VERSION}-win-x64.exe"
)

fail=0
note() { printf '  %s\n' "$1"; }

echo "Verifying release ${TAG} on ${REPO}"

# 1. Every required asset must return 200 (follow redirects to the CDN).
echo "[1/3] reachability"
for f in "${REQUIRED[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -L "${BASE}/${f}")
  if [ "$code" = "200" ]; then
    note "ok   ${f} (${code})"
  else
    note "MISSING  ${f} (${code})"
    fail=1
  fi
done

# 2. sha512 in each metadata file must match the binary GitHub serves. Uses the
#    top-level `path:` + `sha512:` fields electron-builder writes. openssl is
#    used for the digest so this runs identically on macOS and Linux/CI.
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

echo "[2/3] mac metadata integrity"
verify_yml "latest-mac.yml"

echo "[3/3] windows metadata integrity"
verify_yml "latest.yml"

if [ "$fail" -ne 0 ]; then
  echo
  echo "RELEASE INCOMPLETE — auto-update would 404 or be rejected. Fix the assets above before calling ${TAG} done."
  exit 1
fi

echo
echo "RELEASE OK — ${TAG} has a complete, verified updater asset set for mac + win."
