import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// Authoritative "did the app just update?" signal for the first-run What's New
// modal. The renderer cannot tell a fresh install from an upgrade (it writes
// localStorage on every boot), so the main process persists the last-run
// version in userData and compares it to the running version on launch.
//
// Computed once per process and memoised. The version file is written
// immediately so a crash mid-session does not re-trigger the modal next launch.

export interface LaunchInfo {
  version: string
  previousVersion: string | null
  wasUpdated: boolean // previousVersion existed AND differs from version
  firstInstall: boolean // no previous version recorded (a clean install)
}

let cached: LaunchInfo | null = null

function versionFilePath(): string {
  return join(app.getPath('userData'), 'launch-version.json')
}

export function getLaunchInfo(): LaunchInfo {
  if (cached) return cached
  const version = app.getVersion()
  let previousVersion: string | null = null
  try {
    const raw = readFileSync(versionFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    if (parsed && typeof parsed.version === 'string') previousVersion = parsed.version
  } catch {
    previousVersion = null // missing or unreadable → treat as first install
  }
  const firstInstall = previousVersion === null
  const wasUpdated = previousVersion !== null && previousVersion !== version
  // Persist the current version immediately so this only fires once per update.
  try {
    writeFileSync(versionFilePath(), JSON.stringify({ version, updatedAt: Date.now() }), 'utf8')
  } catch {
    // best effort — if we can't write, worst case the modal shows again next boot
  }
  cached = { version, previousVersion, wasUpdated, firstInstall }
  return cached
}
