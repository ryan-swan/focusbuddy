import { test } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Visual-review shots for the Edges + Glass mission (Phase 0 reference pair
// and later phases). Two frames, five themes, shot at 2x so hairlines and
// glass edges can actually be judged. Throwaway; delete when the mission
// closes. Run twice (before / after) with SHOT_DIR pointing at two folders;
// scripts/contact-sheet.py pairs them up.
//
//   SHOT_DIR=/path/before THEMES=light,dark FRAMES=desk,index \
//     npx playwright test tests/e2e/_edgesGlassShots.spec.ts
//
// Frame "desk": a desk canvas with widgets seeded UNDER the floating menu
// (x < 300) so the glass tier has content to show through, plus widgets in
// the open. Frame "index": the Desks index in gallery mode (content cards,
// the reference for container edges).

const OUT = process.env.SHOT_DIR ?? '/tmp'
const THEMES = (process.env.THEMES ?? 'light,dark,futuristic,atelier,gemstone').split(',')
// "desk-panned" (Phase 1b): the desk panned 260px left so widgets slide
// beneath the glass menu; the frame the full-bleed spike exists for.
const FRAMES = (process.env.FRAMES ?? 'desk,index').split(',')
const SCALE = process.env.SHOT_SCALE ?? '2'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

type Page = import('@playwright/test').Page

async function seedIndex(window: Page): Promise<void> {
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

async function seedDesk(window: Page): Promise<string> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Edges reference desk' })
    const mk = (kind: string, title: string, content: string, x: number, y: number, w: number, h: number) =>
      api.widgets.create({ taskId: task.id, kind, title, content, x, y, width: w, height: h })
    // Under the floating menu: these are what glass should reveal.
    await mk('sticky', 'Under the menu', 'This sticky sits beneath the floating menu so the glass has something to show.', 40, 140, 260, 170)
    await mk('note', 'Also under', 'A second widget under the menu edge, lower down.', 60, 360, 280, 180)
    // In the open.
    await mk('sticky', 'Launch checklist', 'Confirm the runsheet, the budget, and the demo path.', 420, 140, 240, 180)
    await mk('note', 'Demo notes', 'Edges from light, not outlines. Glass only where content moves behind it.', 700, 140, 280, 200)
    await mk('sticky', 'Parked', 'Squircles wait for Electron 38.', 420, 380, 240, 160)
    return task.id
  })
}

for (const theme of THEMES) {
  for (const frame of FRAMES) {
    test(`edges+glass shot: ${frame}, ${theme}`, async () => {
      test.setTimeout(90_000)
      launched = await launchApp()
      const { window, app } = launched
      await waitForReady(window)
      // A true 2x render: double the viewport and zoom the webContents by the
      // same factor. innerWidth stays 1440 CSS px, devicePixelRatio reads 2,
      // and the PNG is 2880x1800. (--force-device-scale-factor does nothing
      // useful under Playwright's Electron driver; setViewportSize resets it.)
      // Gemstone's fixed-attachment body layers plus !important backdrop
      // blurs composite to blank slabs under the zoomed capture (DOM probe
      // shows the content is there). It is shot at 1x; every other theme at 2x.
      const scale = theme === 'gemstone' ? 1 : Number(SCALE)
      await window.setViewportSize({ width: 1440 * scale, height: 900 * scale })
      await app.evaluate(({ BrowserWindow }, z) => {
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z)
      }, scale)
      let taskId = ''
      if (frame === 'desk' || frame === 'desk-panned') taskId = await seedDesk(window)
      else await seedIndex(window)
      await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
      await window.reload()
      await waitForReady(window)
      await app.evaluate(({ BrowserWindow }, z) => {
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z)
      }, scale)
      await window.waitForTimeout(300)
      if (frame === 'desk' || frame === 'desk-panned') {
        await window.evaluate((id) => {
          const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
          w.__fbView!.getState().goTask(id)
        }, taskId)
        await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
        await window.waitForTimeout(1200)
        if (frame === 'desk-panned') {
          await window.evaluate(() => {
            const w = window as unknown as { __fbWidgets?: { getState: () => { panBy: (dx: number, dy: number) => void } } }
            w.__fbWidgets!.getState().panBy(-260, 0)
          })
          await window.waitForTimeout(600)
        }
      } else {
        await window.evaluate(() => {
          const w = window as unknown as { __fbView?: { getState: () => { goDesks: (r?: string) => void } } }
          w.__fbView!.getState().goDesks(undefined)
        })
        await window.waitForTimeout(700)
        await window.locator('[data-testid="desks-index-mode-gallery"]').click()
        await window.waitForTimeout(900)
      }
      await window.screenshot({ path: `${OUT}/eg-${frame}-${theme}.png` })
    })
  }
}
