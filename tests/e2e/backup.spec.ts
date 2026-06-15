import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'
import { mkdtempSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Backup / export / restore. The dangerous path is restore — it replaces ALL
// current data — so it must round-trip losslessly and snapshot the current data
// for safety first. Native file dialogs can't be driven by Playwright, so we
// stub electron's dialog in the MAIN process (via app.evaluate) and exercise the
// real IPC handlers + real SQLite end to end.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// Replace electron's file dialogs in main so the real handlers run unattended.
async function stubDialogs(
  l: LaunchedApp,
  opts: { savePath?: string; openPath?: string; confirm?: boolean }
): Promise<void> {
  await l.app.evaluate(({ dialog }, o) => {
    if (o.savePath !== undefined) {
      // @ts-expect-error override for test
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: o.savePath })
    }
    if (o.openPath !== undefined) {
      // @ts-expect-error override for test
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [o.openPath] })
    }
    // @ts-expect-error override for test
    dialog.showMessageBox = async () => ({ response: o.confirm ? 1 : 0 })
  }, opts)
}

const titles = async (l: LaunchedApp): Promise<string[]> =>
  l.window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.nodes.list()).map((n) => n.title)
  })

test('BK-1 — export then restore round-trips losslessly and snapshots current data first', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const dir = mkdtempSync(join(tmpdir(), 'fb-backup-e2e-'))
  const backupPath = join(dir, 'snapshot.fbbackup')

  // Seed state A.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'folder', title: 'AlphaData' })
  })
  expect(await titles(launched)).toContain('AlphaData')

  // Export state A to a file.
  await stubDialogs(launched, { savePath: backupPath })
  const exported = await window.evaluate(() => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.backup.export()
  })
  expect(exported.ok).toBe(true)
  expect(existsSync(backupPath)).toBe(true)

  // Mutate to state B: remove Alpha, add Beta.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const all = await api.nodes.list()
    for (const n of all) await api.nodes.delete(n.id)
    await api.nodes.create({ parentId: null, kind: 'folder', title: 'BetaData' })
  })
  const stateB = await titles(launched)
  expect(stateB).toContain('BetaData')
  expect(stateB).not.toContain('AlphaData')

  // Restore the state-A backup (open dialog → backupPath, confirm the warning).
  await stubDialogs(launched, { openPath: backupPath, confirm: true })
  const restored = await window.evaluate(() => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.backup.restore()
  })
  expect(restored.ok).toBe(true)

  // Reload the window so views re-read the swapped database, then verify state A
  // is back and state B is gone — a lossless round-trip.
  await window.reload()
  await waitForReady(window)
  const afterRestore = await titles(launched)
  expect(afterRestore).toContain('AlphaData')
  expect(afterRestore).not.toContain('BetaData')

  // The current data (state B) was snapshotted before the swap — at least one
  // backup now exists in the backups folder.
  const info = await window.evaluate(() => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.backup.info()
  })
  expect(info.count).toBeGreaterThanOrEqual(1)
})

test('BK-2 — restoring a non-database file is rejected and leaves data untouched', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const dir = mkdtempSync(join(tmpdir(), 'fb-backup-e2e-'))
  const junkPath = join(dir, 'not-a-db.fbbackup')
  writeFileSync(junkPath, 'this is plainly not a sqlite database', 'utf8')

  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'folder', title: 'KeepMe' })
  })

  await stubDialogs(launched, { openPath: junkPath, confirm: true })
  const result = await window.evaluate(() => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.backup.restore()
  })
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.canceled).not.toBe(true) // a real rejection, not a cancel

  // Data is untouched.
  await window.reload()
  await waitForReady(window)
  expect(await titles(launched)).toContain('KeepMe')
})
