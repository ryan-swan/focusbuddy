import { test, expect } from '@playwright/test'
import { join } from 'path'
import { readFileSync } from 'fs'
import { launchApp, waitForReady } from './_helpers'
import type { Page } from '@playwright/test'

// WCAG conformance (PLX-A11Y-001) and 200% zoom (PLX-A11Y-006), verified against the
// real built app with axe-core (injected directly; AxeBuilder cannot attach to
// Electron). A surface passes A11Y-001 only with zero serious/critical violations.

const axeSource = readFileSync(join(require.resolve('axe-core/package.json'), '..', 'axe.min.js'), 'utf-8')

async function scan(window: Page): Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> {
  await window.evaluate(axeSource)
  return window.evaluate(async () => {
    // @ts-expect-error injected global
    return await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
  })
}
const seriousOrCritical = (r: { violations: Array<{ impact: string }> }): Array<{ impact: string }> =>
  r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

async function openHome(window: Page): Promise<void> {
  await window.evaluate(() => (window as unknown as { __fbView?: { getState: () => { go: (v: unknown) => void } } }).__fbView?.getState().go({ kind: 'suite' }))
  await window.waitForSelector('[data-testid="plexisuite-home"]', { timeout: 8000 })
  await window.waitForTimeout(400)
}

async function openDesk(window: Page): Promise<void> {
  const id = await window.evaluate(async () => {
    const api = (window as unknown as { api: { nodes: { create: (d: unknown) => Promise<{ id: string }> }; widgets: { create: (d: unknown) => Promise<unknown> } } }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'A11Y desk' })
    await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'Note', content: 'hello', x: 160, y: 160, width: 220, height: 180 })
    return task.id
  })
  await window.reload()
  await waitForReady(window)
  await window.evaluate((tid) => {
    const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } }; __fbNodes?: { getState: () => { setActive: (id: string) => void } } }
    w.__fbNodes?.getState().setActive(tid)
    w.__fbView?.getState().goTask(tid)
  }, id)
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForTimeout(400)
}

test('test_plx_a11y_001_wcag_aa_no_serious_or_critical', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openHome(window)
    const home = seriousOrCritical(await scan(window))
    expect(home, `Home serious/critical: ${JSON.stringify(home.map((v) => v))}`).toEqual([])
    await openDesk(window)
    const desk = seriousOrCritical(await scan(window))
    expect(desk, `Desk serious/critical: ${JSON.stringify(desk.map((v) => v))}`).toEqual([])
  } finally {
    await dispose()
  }
})

test('test_plx_a11y_006_200pct_zoom_no_content_loss', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openHome(window)
    // Emulate 200% zoom.
    await window.evaluate(() => {
      ;(document.documentElement.style as unknown as { zoom: string }).zoom = '2'
    })
    await window.waitForTimeout(300)
    // The page body must not trap horizontal scroll, and the primary surface stays present.
    const overflow = await window.evaluate(() => {
      const el = document.scrollingElement || document.documentElement
      return { scrollW: el.scrollWidth, clientW: el.clientWidth }
    })
    expect(overflow.scrollW, `h-scroll at 200%: ${overflow.scrollW} vs ${overflow.clientW}`).toBeLessThanOrEqual(overflow.clientW + 4)
    await expect(window.locator('[data-testid="plexisuite-home"]')).toBeVisible()
  } finally {
    await dispose()
  }
})
