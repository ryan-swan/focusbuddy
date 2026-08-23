import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Visual-review shots for App-UI phase 5a: the Desks/Rooms index aligned to
// the design system (type ramp, radius law, press feedback, staggered
// entrance, honest empty states). Throwaway; delete when the phase closes.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seed(window: import('@playwright/test').Page): Promise<void> {
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const r1 = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Launch room' })
    const r2 = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Client work' })
    await api.nodes.create({ parentId: r1.id, kind: 'task', title: 'Runsheet desk' })
    await api.nodes.create({ parentId: r1.id, kind: 'task', title: 'Budget desk' })
    await api.nodes.create({ parentId: r2.id, kind: 'task', title: 'Proposal desk' })
    await api.nodes.create({ parentId: null, kind: 'task', title: 'Scratch desk' })
  })
}

async function goDesksIndex(window: import('@playwright/test').Page): Promise<void> {
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goDesks: (r?: string) => void } } }
    w.__fbView!.getState().goDesks(undefined)
  })
  await window.waitForTimeout(700)
}

test('desks index: all five modes, dark', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await seed(window)
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await goDesksIndex(window)

  for (const mode of ['gallery', 'list', 'kanban', 'table', 'timeline'] as const) {
    await window.locator(`[data-testid="desks-index-mode-${mode}"]`).click()
    await window.waitForTimeout(600)
    await window.screenshot({ path: `${OUT}/5a-desks-${mode}-dark.png` })
  }

  // Search-empty state: honest message + clear-search affordance.
  await window.locator('[data-testid="desks-index-search"]').fill('zzz-no-match')
  await window.waitForTimeout(400)
  await expect(window.locator('[data-testid="desks-index-empty"]')).toBeVisible()
  await window.screenshot({ path: `${OUT}/5a-desks-empty-search-dark.png` })
})

test('rooms index: gallery in atelier', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await seed(window)
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'atelier'))
  await window.reload()
  await waitForReady(window)
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goRooms: () => void } } }
    w.__fbView!.getState().goRooms()
  })
  await window.waitForTimeout(700)
  await window.locator('[data-testid="rooms-index-mode-gallery"]').click()
  await window.waitForTimeout(600)
  await window.screenshot({ path: `${OUT}/5a-rooms-gallery-atelier.png` })
})
