import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Auto-grow: a widget's height follows its content. A card seeded short with a
// long body should grow taller than its seeded height; a short-body card stays
// near its seeded height. Long-form text kinds (note/page/markdown) and the
// browser are excluded (they scroll) — covered by the unit policy test.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seedCard(l: LaunchedApp, content: string, height: number): Promise<string> {
  const { window } = l
  await waitForReady(window)
  const id = await window.evaluate(
    async ({ content, height }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'AutoGrowTest' })
      const w = await api.widgets.create({
        taskId: t.id,
        kind: 'card',
        title: '',
        content,
        x: 200,
        y: 200,
        width: 320,
        height
      })
      return w.id
    },
    { content, height }
  )
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /AutoGrowTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 8000 })
  return id
}

const heightOf = async (l: LaunchedApp, id: string): Promise<number> => {
  return l.window.evaluate((wid) => {
    const el = document.querySelector(`[data-widget-id="${wid}"]`) as HTMLElement
    return Math.round(el.getBoundingClientRect().height)
  }, id)
}

test('AG-1 — a card with long content grows past its seeded height', async () => {
  launched = await launchApp()
  const longBody = Array.from({ length: 25 }, (_, i) => `Line ${i + 1} of a long card body`).join('\n')
  const id = await seedCard(launched, longBody, 140)
  // Auto-grow runs on a ResizeObserver tick after mount.
  await launched.window.waitForTimeout(600)
  const h = await heightOf(launched, id)
  expect(h).toBeGreaterThan(200)
})

test('AG-2 — a card with short content stays small', async () => {
  launched = await launchApp()
  const id = await seedCard(launched, 'Just a line', 140)
  await launched.window.waitForTimeout(600)
  const h = await heightOf(launched, id)
  expect(h).toBeLessThan(260)
})

test('AG-4 — a field picker grows to fit its type grid', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const id = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'FieldGrowTest' })
    // No content → the field shows its (tall) type picker grid.
    const w = await api.widgets.create({
      taskId: t.id,
      kind: 'field',
      title: '',
      content: '',
      x: 200,
      y: 200,
      width: 280,
      height: 120
    })
    return w.id
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /FieldGrowTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 8000 })
  await window.waitForTimeout(600)
  const h = await heightOf(launched, id)
  expect(h).toBeGreaterThan(180)
})

test('AG-3 — a sticky with long content grows instead of scrolling', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const longText = Array.from({ length: 22 }, (_, i) => `note line ${i + 1}`).join('\n')
  const id = await window.evaluate(async (content) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'StickyGrowTest' })
    const w = await api.widgets.create({
      taskId: t.id,
      kind: 'sticky',
      title: '',
      content,
      x: 200,
      y: 200,
      width: 240,
      height: 140
    })
    return w.id
  }, longText)
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /StickyGrowTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 8000 })
  await window.waitForTimeout(600)
  const h = await heightOf(launched, id)
  expect(h).toBeGreaterThan(200)
})
