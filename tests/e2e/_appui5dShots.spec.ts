import { test, expect } from '@playwright/test'
import { gotoView, launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Visual-review shots for App-UI phase 5d: All Tasks aligned to the design
// system (off desk-paper onto the token surface, chips lose their 1px
// outlines, ramp, press, honest empty state). Throwaway.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seedTasks(window: import('@playwright/test').Page): Promise<void> {
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const room = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Launch room' })
    const t1 = await api.nodes.create({ parentId: room.id, kind: 'task', title: 'Write the runsheet' })
    await api.nodes.update(t1.id, { dueDate: Date.now() - 86_400_000 })
    const t2 = await api.nodes.create({ parentId: room.id, kind: 'task', title: 'Book the venue' })
    await api.nodes.update(t2.id, { dueDate: Date.now() + 86_400_000, status: 'in_progress' })
    const t3 = await api.nodes.create({ parentId: null, kind: 'task', title: 'Send invites' })
    await api.nodes.update(t3.id, { status: 'done' })
  })
}

for (const theme of ['dark', 'atelier'] as const) {
  test(`all tasks, ${theme}`, async () => {
    launched = await launchApp()
    const { window } = launched
    await waitForReady(window)
    await window.setViewportSize({ width: 1440, height: 900 })
    await seedTasks(window)
    await window.evaluate((t) => localStorage.setItem('fb.theme.mode', t), theme)
    await window.reload()
    await waitForReady(window)
    await gotoView(window, 'goAllTasks')
    await window.waitForTimeout(700)
    await expect(window.getByRole('heading', { name: 'All Tasks' })).toBeVisible()
    await window.screenshot({ path: `${OUT}/5d-tasks-${theme}.png` })
  })
}

test('empty state offers a real New task affordance', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goAllTasks')
  await window.waitForTimeout(500)
  await expect(window.getByRole('button', { name: /new task/i })).toBeVisible()
  await window.screenshot({ path: `${OUT}/5d-tasks-empty-dark.png` })
})
