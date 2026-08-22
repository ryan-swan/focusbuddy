import { test, expect } from '@playwright/test'
import { gotoView, launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Rooms must navigate. Clicking a room anywhere on Home used to be a dead end
// (the folder branch of openDesk called goPlexiDesk() with no id — a no-op
// from inside the PlexiDesk shell). A room click now lands on the room's
// dashboard via goRoom, the same path RoomsView uses. In the Home navigator,
// the first click selects the room (fills the desks column) and a second
// click on the selected room opens it.

const OUT = process.env.SHOT_DIR ?? '/tmp'

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seedRoomWithDesk(window: import('@playwright/test').Page): Promise<{ roomId: string }> {
  return await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const room = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Launch room' })
    await api.nodes.create({ parentId: room.id, kind: 'task', title: 'Runsheet desk' })
    return { roomId: room.id }
  })
}

async function currentView(window: import('@playwright/test').Page): Promise<Record<string, unknown>> {
  return await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { view: Record<string, unknown> } } }
    return w.__fbView!.getState().view
  })
}

test('a room in the Home navigator opens its dashboard on the second click', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  const { roomId } = await seedRoomWithDesk(window)
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'dark'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goHome')

  const roomRow = window.locator(`[data-testid="home-nav-room-${roomId}"]`)
  await roomRow.scrollIntoViewIfNeeded()
  await expect(roomRow).toBeVisible()

  // First click: selects — the desks column fills, no navigation.
  await roomRow.click()
  await window.waitForTimeout(200)
  expect((await currentView(window)).kind).not.toBe('project-dashboard')
  await expect(window.locator('[data-testid="home-desks"]')).toContainText('Runsheet desk')
  await window.screenshot({ path: `${OUT}/rooms-nav-selected-dark.png` })

  // Second click on the selected room: opens it for real.
  await roomRow.click()
  await window.waitForTimeout(400)
  const view = await currentView(window)
  expect(view.kind).toBe('project-dashboard')
  expect(view.projectId).toBe(roomId)
  await window.screenshot({ path: `${OUT}/rooms-nav-opened-dark.png` })
})

test('atelier: the room open path holds and shoots clean', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  const { roomId } = await seedRoomWithDesk(window)
  await window.evaluate(() => localStorage.setItem('fb.theme.mode', 'atelier'))
  await window.reload()
  await waitForReady(window)
  await gotoView(window, 'goHome')

  const roomRow = window.locator(`[data-testid="home-nav-room-${roomId}"]`)
  await roomRow.scrollIntoViewIfNeeded()
  await roomRow.click()
  await window.waitForTimeout(200)
  await window.screenshot({ path: `${OUT}/rooms-nav-selected-atelier.png` })
  await roomRow.click()
  await window.waitForTimeout(400)
  const view = await currentView(window)
  expect(view.kind).toBe('project-dashboard')
  expect(view.projectId).toBe(roomId)
  await window.screenshot({ path: `${OUT}/rooms-nav-opened-atelier.png` })
})
