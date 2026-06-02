# Haptyx desktop — release workflow

The desktop app polls **GitHub Releases** for updates. When you publish a new release, every installed copy detects it within 4 hours (or instantly via the "v2.3.0" pill in the footer → "check for updates" click), downloads in the background, and shows an **Install v2.x.x** button in the footer when ready.

## Cut a release

```bash
# 1. Make sure everything is committed + ON A TAG
git status                # working tree clean
git tag v2.3.0            # SemVer tag matching package.json version
git push origin v2.3.0    # push the tag to GitHub

# 2. Authenticate to GitHub (one-time per shell)
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Token needs `public_repo` or `repo` scope.
# Create one at https://github.com/settings/tokens

# 3. Build + publish the zip + latest-mac.yml to GitHub Releases as a draft
cd projects/focusbuddy
npm run dist:release

# 4. Open the draft on GitHub, add release notes, click "Publish release".
# That's it — installed copies will pick it up.
```

## What gets published

electron-builder uploads three artifacts to the draft release:

- `Haptyx-2.3.0-mac-arm64.zip` — the app bundle (what installs)
- `Haptyx-2.3.0-mac-arm64.zip.blockmap` — delta-update metadata (smaller patches on the next version)
- `latest-mac.yml` — the manifest electron-updater reads to know "is there a new version?"

The `latest-mac.yml` is what `autoUpdater.checkForUpdates()` fetches from
`https://github.com/saasmouth/focusbuddy/releases/latest/download/latest-mac.yml`.
The version, file URLs, and SHA512 hashes inside drive the update flow.

## How the in-app side works

- On boot, after 30s, `installAutoUpdater()` calls `checkForUpdates()`. Repeats every 4h.
- The version pill in the footer (`v2.3.0 · 2026-06-01`) is also a button — clicking forces an immediate check.
- State transitions broadcast via `update:state` IPC. The renderer's `UpdaterBanner` subscribes and shows:
  - `checking` → faint pulsing dot
  - `available` → "Update available · v2.3.1" (auto-download in progress)
  - `downloading` → "Downloading · NN%"
  - `ready` → **"Install v2.3.1"** button → calls `quitAndInstall(true, true)` → relaunches into the new version
  - `error` → "Update check failed — retry"

The "stays as a chip in the footer" design is deliberate — no modal popup. The user installs when they want.

## What if I don't want auto-updates yet?

`autoUpdater.autoDownload = false` would gate the download behind a manual click. Currently it's `true`. Easy toggle in `src/main/autoUpdate.ts`.

## Notarization / signing

Right now the app is **ad-hoc signed** (via `build/adhoc-sign.cjs`). Once we have an Apple Developer cert and notarization wired up, the same flow continues to work — electron-updater verifies signatures against the cert, so a signed update replaces an ad-hoc signed install seamlessly.

## What doesn't work yet

- **Windows / Linux**: the publish config publishes only mac-arm64 zip. Add `--win nsis` / `--linux AppImage` to the release command when we ship those.
- **Delta updates**: electron-builder writes the blockmap, but full-replace is what happens until we have at least two consecutive releases on the channel.
- **Dev builds**: `installAutoUpdater()` is a no-op when `app.isPackaged === false`. Run a packaged build (`npm run dist:zip`) to exercise the flow locally.
