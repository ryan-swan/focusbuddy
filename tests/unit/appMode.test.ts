import { describe, it, expect } from 'vitest'
import { detectOfficeBuild } from '../../src/main/appMode'

// Regression guard for the bug where PlexiOffice quit on launch whenever PlexiDesk
// was open: the packaged bundle reports app.getName()="focusbuddy" for BOTH apps,
// so office detection must come from the env or the executable path, not the name.

describe('detectOfficeBuild', () => {
  it('detects the office build from the PLEXI_APP env (dev:office)', () => {
    expect(
      detectOfficeBuild({
        plexiAppEnv: 'office',
        execPath: '/Applications/agentic/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
        appName: 'focusbuddy'
      })
    ).toBe(true)
  })

  it('detects the packaged office build from the macOS executable path', () => {
    // The crucial case: no env var, and app.getName() is the misleading
    // "focusbuddy" — detection must still succeed from the bundle path.
    expect(
      detectOfficeBuild({
        plexiAppEnv: undefined,
        execPath: '/Applications/PlexiOffice.app/Contents/MacOS/PlexiOffice',
        appName: 'focusbuddy'
      })
    ).toBe(true)
  })

  it('detects the packaged office build from the Windows executable path', () => {
    expect(
      detectOfficeBuild({
        plexiAppEnv: undefined,
        execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\PlexiOffice\\PlexiOffice.exe',
        appName: 'focusbuddy'
      })
    ).toBe(true)
  })

  it('detects the office build from the app name once setName has applied', () => {
    expect(
      detectOfficeBuild({ plexiAppEnv: undefined, execPath: '/anything/Electron', appName: 'PlexiOffice' })
    ).toBe(true)
  })

  it('does NOT flag the packaged PlexiDesk build as office', () => {
    expect(
      detectOfficeBuild({
        plexiAppEnv: undefined,
        execPath: '/Applications/PlexiDesk.app/Contents/MacOS/PlexiDesk',
        appName: 'focusbuddy'
      })
    ).toBe(false)
  })

  it('does NOT flag a plain dev PlexiDesk run as office', () => {
    expect(
      detectOfficeBuild({
        plexiAppEnv: undefined,
        execPath: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
        appName: 'focusbuddy'
      })
    ).toBe(false)
  })
})
