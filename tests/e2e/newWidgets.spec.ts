import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Shape / Card / Custom-block widgets — they appear in the catalog, mount on the
// canvas, and persist their JSON content through a reload.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seedAndOpen(
  l: LaunchedApp,
  kind: string,
  content: string
): Promise<{ taskId: string; id: string }> {
  const { window } = l
  await waitForReady(window)
  const seeded = await window.evaluate(
    async ({ kind, content }: { kind: string; content: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'NewWidgets' })
      const w = await api.widgets.create({
        taskId: t.id,
        kind: kind as never,
        title: '',
        content,
        x: 200,
        y: 160,
        width: 300,
        height: 240
      })
      return { taskId: t.id, id: w.id }
    },
    { kind, content }
  )
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /NewWidgets/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  return seeded
}

test('catalog exposes shape, card and custom-block tiles', async () => {
  launched = await launchApp()
  const { window } = launched
  await seedAndOpen(launched, 'sticky', 's')
  await window.locator('[data-testid="palette-add-button"]').click()
  await window.waitForTimeout(300)
  // shape / card / custom-block are Advanced tiles (go-live picker simplification),
  // so expand the Advanced section before asserting they're present.
  await window.locator('[data-testid="palette-advanced-toggle"]').click().catch(() => {})
  await window.waitForTimeout(150)
  for (const kind of ['shape', 'card', 'custom-block']) {
    const present = await window.evaluate(
      (k) =>
        !!document.querySelector(`[data-testid="palette-add-${k}"]`) ||
        !!document.querySelector(`[data-testid="palette-locked-${k}"]`),
      kind
    )
    expect(present, `palette has ${kind}`).toBe(true)
  }
})

test('shape widget mounts and renders an SVG', async () => {
  launched = await launchApp()
  const { window } = launched
  const { id } = await seedAndOpen(
    launched,
    'shape',
    JSON.stringify({ shape: 'ellipse', fill: '#ff0000', stroke: '#000000', strokeWidth: 2, label: 'Hi' })
  )
  await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 5_000 })
  const hasSvg = await window.evaluate(
    (wid) => !!document.querySelector(`[data-widget-id="${wid}"] svg ellipse`),
    id
  )
  expect(hasSvg).toBe(true)
})

test('custom-block persists its designed fields through a reload', async () => {
  launched = await launchApp()
  const { window } = launched
  const blockContent = JSON.stringify({
    title: 'Contact',
    fields: [
      { id: 'a1', type: 'text', label: 'Name', x: 16, y: 16, w: 200, h: 58, required: true },
      { id: 'b2', type: 'email', label: 'Email', x: 16, y: 90, w: 220, h: 58 }
    ]
  })
  const { taskId, id } = await seedAndOpen(launched, 'custom-block', blockContent)
  await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 5_000 })

  // The two field labels render (textContent — robust to layout/visibility).
  const text = await window.evaluate(
    (wid) => document.querySelector(`[data-widget-id="${wid}"]`)?.textContent ?? '',
    id
  )
  expect(text).toContain('Name')
  expect(text).toContain('Email')

  // Content survived the DB round-trip.
  const stored = await window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const all = await api.widgets.listByTask(tid)
    return all.find((w) => w.kind === 'custom-block')?.content ?? ''
  }, taskId)
  expect(stored).toContain('Contact')
  expect(stored).toContain('Email')
})
