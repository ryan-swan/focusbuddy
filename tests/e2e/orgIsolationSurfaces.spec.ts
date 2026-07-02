/**
 * Extends the multi-org isolation guarantee to the surfaces added in this pass:
 * the calendar (time blocks), knowledge and tables. Data created while Personal
 * is active must not appear under another org, and must return when Personal is
 * active again. (Vault needs an unlocked master password, so it is covered by the
 * same org_id scoping but not exercised here.)
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('OIS-1 calendar, knowledge and tables are isolated per active org', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // Seed one of each in the Personal org.
    const ids = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('personal')
      const now = Date.now()
      const block = await api.timeBlocks.create({ title: 'Personal block', startMs: now, durationMin: 30 })
      const note = await api.knowledge.create({ title: 'Personal note', body: 'x', tags: [], pinned: false })
      const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Table host' })
      const table = await api.tables.create({ taskId: task.id, title: 'Personal table' })
      return { block: block.id, note: note.id, table: table.id, from: now - 86_400_000, to: now + 86_400_000 }
    })

    // All visible under Personal.
    const home = await window.evaluate(async (d: { block: string; note: string; table: string; from: number; to: number }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return {
        block: (await api.timeBlocks.list(d.from, d.to)).some((b) => b.id === d.block),
        note: (await api.knowledge.list()).some((n) => n.id === d.note),
        table: (await api.tables.list()).some((t) => t.id === d.table)
      }
    }, ids)
    expect(home).toEqual({ block: true, note: true, table: true })

    // None visible under a different org.
    const org = await window.evaluate(async (d: { block: string; note: string; table: string; from: number; to: number }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('org-test-surfaces')
      return {
        block: (await api.timeBlocks.list(d.from, d.to)).some((b) => b.id === d.block),
        note: (await api.knowledge.list()).some((n) => n.id === d.note),
        table: (await api.tables.list()).some((t) => t.id === d.table)
      }
    }, ids)
    expect(org).toEqual({ block: false, note: false, table: false })

    // Returns when Personal is active again.
    const back = await window.evaluate(async (d: { block: string; note: string; table: string; from: number; to: number }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('personal')
      return {
        block: (await api.timeBlocks.list(d.from, d.to)).some((b) => b.id === d.block),
        note: (await api.knowledge.list()).some((n) => n.id === d.note),
        table: (await api.tables.list()).some((t) => t.id === d.table)
      }
    }, ids)
    expect(back).toEqual({ block: true, note: true, table: true })
  } finally {
    await dispose()
  }
})
