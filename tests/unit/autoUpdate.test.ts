import { describe, expect, test, vi } from 'vitest'

// Smoke tests for the autoUpdate module wiring.
//
// We can't exercise the real electron-updater here (it requires a
// packaged app + signature) but we can prove:
//   1. The module is importable without crashing when Electron's `app`
//      reports !isPackaged.
//   2. `getCurrentUpdateState()` returns a sane default.
//   3. `installAutoUpdater()` is idempotent + a no-op in dev mode.

vi.mock('electron', () => {
  return {
    app: {
      isPackaged: false
    },
    autoUpdater: {
      removeAllListeners: vi.fn()
    },
    BrowserWindow: {
      getAllWindows: () => []
    }
  }
})

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    autoDownload: true,
    autoInstallOnAppQuit: true,
    forceDevUpdateConfig: false
  }
}))

describe('autoUpdate', () => {
  test('initial state is idle', async () => {
    const m = await import('../../src/main/autoUpdate')
    expect(m.getCurrentUpdateState()).toEqual({ kind: 'idle' })
  })

  test('installAutoUpdater is no-op when app is not packaged', async () => {
    const m = await import('../../src/main/autoUpdate')
    // Should not throw + should leave state at idle.
    expect(() => m.installAutoUpdater()).not.toThrow()
    expect(m.getCurrentUpdateState().kind).toBe('idle')
  })
})
