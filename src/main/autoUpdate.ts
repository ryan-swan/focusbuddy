// Auto-update plumbing — wraps electron-updater so the renderer doesn't
// import an Electron-only module directly. State flows out via an
// `update:state` IPC event; the renderer subscribes and shows a small
// banner when an update has been downloaded.
//
// Distribution channel: GitHub Releases. electron-builder generates
// the `latest-mac.yml` metadata file alongside the .zip when we run
// `npm run dist:release`, then publishes both to a draft release.
// Installed copies poll for updates on boot + every 4h.

import { app, autoUpdater as nativeAutoUpdater, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

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

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
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
