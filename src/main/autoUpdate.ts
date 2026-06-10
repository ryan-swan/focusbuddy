// Auto-update plumbing — wraps electron-updater so the renderer doesn't
// import an Electron-only module directly. State flows out via an
// `update:state` IPC event; the renderer subscribes and shows a small
// banner when an update has been downloaded.
//
// Distribution channel: GitHub Releases. electron-builder generates
// the `latest-mac.yml` metadata file alongside the .zip when we run
// `npm run dist:release`, then publishes both to a draft release.
// Installed copies poll for updates on boot + every 4h.

import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, shell } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

// macOS builds are ad-hoc signed (no Apple Developer ID), and Squirrel.Mac
// refuses to apply an update unless it is signed by the same Developer ID. So
// on macOS we do NOT auto-download or auto-install (that path always fails and
// surfaces as a scary "update check failed" error after the download stages);
// instead we detect the new version and offer a one-click download of the
// release. Windows installs in place as normal.
const IS_MAC = process.platform === 'darwin'
const RELEASES_URL = 'https://github.com/saasmouth/focusbuddy/releases/latest'

export function openDownloadPage(): void {
  void shell.openExternal(RELEASES_URL)
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; releaseNotes?: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string; releaseNotes?: string }
  | { kind: 'none'; currentVersion: string }
  | { kind: 'error'; message: string }

let current: UpdateState = { kind: 'idle' }

function broadcast(state: UpdateState): void {
  current = state
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('update:state', state)
    } catch {
      // window may have closed mid-broadcast — ignore
    }
  }
}

export function getCurrentUpdateState(): UpdateState {
  return current
}

export function installUpdateAndRestart(): void {
  // electron-updater's quitAndInstall closes all windows + spawns the
  // installer + relaunches. Safe to call multiple times — internally
  // guarded.
  autoUpdater.quitAndInstall(true, true)
}

export function checkForUpdates(): void {
  // checkForUpdatesAndNotify is the all-in-one but it spawns a native
  // notification, which we don't want — the in-app banner is enough.
  // Plain checkForUpdates() emits the events we wire to below.
  autoUpdater.checkForUpdates().catch((err: Error) => {
    broadcast({ kind: 'error', message: err.message })
  })
}

/** Install the auto-update lifecycle. Idempotent. */
export function installAutoUpdater(): void {
  // Dev/test builds don't have a code-signed app, and electron-updater
  // refuses to run against them. Bail without erroring so the rest of
  // the boot path stays green.
  if (!app.isPackaged) {
    broadcast({ kind: 'idle' })
    return
  }
  // Silence the native (Squirrel.Mac) updater so we don't see two
  // simultaneous flows in dev/test environments. electron-updater
  // delegates to Squirrel internally, this guards against a second
  // event loop being installed by a third-party module.
  nativeAutoUpdater.removeAllListeners()

  // On macOS we only DETECT updates (autoDownload off) because staging the
  // download for Squirrel.Mac fails on an ad-hoc signature; the renderer turns
  // the "available" state into a one-click download instead. On Windows the
  // full download-and-install-on-quit flow works.
  autoUpdater.autoDownload = !IS_MAC
  autoUpdater.autoInstallOnAppQuit = !IS_MAC
  // Don't run on dev builds (no signature → updater refuses).
  autoUpdater.forceDevUpdateConfig = false

  autoUpdater.on('checking-for-update', () => broadcast({ kind: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    broadcast({
      kind: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  )
  autoUpdater.on('update-not-available', (info: UpdateInfo) =>
    broadcast({ kind: 'none', currentVersion: info.version })
  )
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    broadcast({ kind: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    broadcast({
      kind: 'ready',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  )
  autoUpdater.on('error', (err: Error) =>
    broadcast({ kind: 'error', message: err.message })
  )

  // Kick off the first check shortly after boot so the user doesn't
  // wait. Then poll every 4 hours.
  const FIRST_CHECK_MS = 30 * 1000
  const POLL_MS = 4 * 60 * 60 * 1000
  setTimeout(() => checkForUpdates(), FIRST_CHECK_MS)
  setInterval(() => checkForUpdates(), POLL_MS)
}
