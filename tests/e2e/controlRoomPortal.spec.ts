import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Control room: a portal is a live data SOURCE. Wired into an agent it feeds the
// whole desk it points at; wired portal-to-portal it inherits another portal's
// desks. agents.previewInput resolves exactly what a widget would contribute, so
// we can verify the aggregation deterministically (no API key needed).

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function hideAssistant(window: LaunchedApp['window']): Promise<void> {
  const btn = window.getByRole('button', { name: 'Hide assistant panel' })
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  await window.waitForTimeout(150)
}

test('a portal feeds the full content of the desk it points at', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const content = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const deskOne = await api.nodes.create({ parentId: null, kind: 'task', title: 'Desk One' })
    await api.widgets.create({
      taskId: deskOne.id, kind: 'sticky', title: 'note', content: 'DESK-ONE-MARKER',
      x: 100, y: 100, width: 200, height: 160
    })
    const room = await api.nodes.create({ parentId: null, kind: 'task', title: 'Control Room' })
    const portal = await api.widgets.create({
      taskId: room.id, kind: 'portal', title: 'Portal',
      content: JSON.stringify({ targetTaskId: deskOne.id }),
      x: 100, y: 100, width: 320, height: 260
    })
    return (await api.agents.previewInput(portal.id)).content
  })
  expect(content).toContain('Desk One')
  expect(content).toContain('DESK-ONE-MARKER')
})

test('portal-to-portal: a portal inherits another portal’s desks', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const content = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const deskOne = await api.nodes.create({ parentId: null, kind: 'task', title: 'Desk One' })
    await api.widgets.create({
      taskId: deskOne.id, kind: 'sticky', title: 'note', content: 'INHERITED-MARKER',
      x: 100, y: 100, width: 200, height: 160
    })
    const room = await api.nodes.create({ parentId: null, kind: 'task', title: 'Control Room' })
    const portalA = await api.widgets.create({
      taskId: room.id, kind: 'portal', title: 'A',
      content: JSON.stringify({ targetTaskId: deskOne.id }),
      x: 100, y: 100, width: 320, height: 260
    })
    // B has no target of its own — it's a pure rollup that inherits A.
    const portalB = await api.widgets.create({
      taskId: room.id, kind: 'portal', title: 'B', content: '',
      x: 500, y: 100, width: 320, height: 260
    })
    await api.widgetLinks.create(portalA.id, portalB.id, room.id)
    return (await api.agents.previewInput(portalB.id)).content
  })
  // B carries Desk One's content via A.
  expect(content).toContain('INHERITED-MARKER')
})

test('a portal cycle terminates instead of hanging', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ok = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const room = await api.nodes.create({ parentId: null, kind: 'task', title: 'Cycle' })
    const a = await api.widgets.create({ taskId: room.id, kind: 'portal', title: 'A', content: '', x: 80, y: 80, width: 300, height: 240 })
    const b = await api.widgets.create({ taskId: room.id, kind: 'portal', title: 'B', content: '', x: 440, y: 80, width: 300, height: 240 })
    await api.widgetLinks.create(a.id, b.id, room.id)
    await api.widgetLinks.create(b.id, a.id, room.id) // cycle A↔B
    const res = await Promise.race([
      api.agents.previewInput(a.id).then(() => 'returned'),
      new Promise((r) => setTimeout(() => r('timeout'), 4000))
    ])
    return res
  })
  expect(ok).toBe('returned')
})

test('a configured portal shows an "inherits" chip for its wired sources', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const deskOne = await api.nodes.create({ parentId: null, kind: 'task', title: 'Desk One' })
    const room = await api.nodes.create({ parentId: null, kind: 'task', title: 'Room view' })
    const portalA = await api.widgets.create({
      taskId: room.id, kind: 'portal', title: 'A',
      content: JSON.stringify({ targetTaskId: deskOne.id }),
      x: 120, y: 140, width: 320, height: 260
    })
    const portalB = await api.widgets.create({
      taskId: room.id, kind: 'portal', title: 'B',
      content: JSON.stringify({ targetTaskId: deskOne.id }),
      x: 500, y: 140, width: 320, height: 260
    })
    await api.widgetLinks.create(portalA.id, portalB.id, room.id)
    return { roomId: room.id, portalBId: portalB.id }
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Room view/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)
  await hideAssistant(window)

  await expect(
    window.locator(`[data-widget-id="${ids.portalBId}"] [data-testid="portal-inherits"]`)
  ).toContainText('+1')
})
