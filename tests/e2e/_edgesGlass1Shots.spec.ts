import { test } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Edges + Glass Phase 1 frames: the glass tiers on floating chrome. Throwaway.
//   popover  — the org switcher menu open over the side menu (panel tier)
//   modal    — the New dialog over the desk (fb-scrim + its sheet)
//   ctxmenu  — a widget header's context menu over the canvas (panel tier)
// Five themes; 2x capture except Gemstone (see _edgesGlassShots.spec.ts).

const OUT = process.env.SHOT_DIR ?? '/tmp'
const THEMES = (process.env.THEMES ?? 'light,dark,futuristic,atelier,gemstone').split(',')
const FRAMES = (process.env.FRAMES ?? 'popover,modal,ctxmenu').split(',')

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})
type Page = import('@playwright/test').Page

async function seedDesk(window: Page): Promise<string> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Glass reference desk' })
    await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'Launch checklist', content: 'Confirm the runsheet, the budget, and the demo path.', x: 420, y: 140, width: 260, height: 180 })
    await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'Parked', content: 'Squircles wait for Electron 38.', x: 720, y: 140, width: 240, height: 160 })
    await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'Demo notes', content: 'Edges from light, not outlines. Glass only where content moves behind it.', x: 420, y: 360, width: 300, height: 180 })
    return task.id
  })
}

for (const theme of THEMES) {
  for (const frame of FRAMES) {
    test(`edges+glass 1: ${frame}, ${theme}`, async () => {
      test.setTimeout(90_000)
      launched = await launchApp()
      const { window, app } = launched
      await waitForReady(window)
      const scale = theme === 'gemstone' ? 1 : 2
      const zoom = () => app.evaluate(({ BrowserWindow }, z) => { BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z) }, scale)
      await window.setViewportSize({ width: 1440 * scale, height: 900 * scale })
      await zoom()
      const taskId = await seedDesk(window)
      await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
      await window.reload()
      await waitForReady(window)
      await zoom()
      await window.evaluate((id) => {
        const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
        w.__fbView!.getState().goTask(id)
      }, taskId)
      await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
      await window.waitForTimeout(900)
      if (frame === 'popover') {
        await window.locator('[data-testid="org-switcher-button"]').click()
        await window.waitForTimeout(500)
      } else if (frame === 'modal') {
        await window.getByRole('button', { name: /^New$|New room/ }).first().click()
        await window.waitForTimeout(600)
      } else if (frame === 'ctxmenu') {
        const title = window.locator('[data-testid^="widget-title-"]').first()
        await title.click({ button: 'right' })
        await window.waitForTimeout(500)
      }
      await window.screenshot({ path: `${OUT}/eg1-${frame}-${theme}.png` })
    })
  }
}
