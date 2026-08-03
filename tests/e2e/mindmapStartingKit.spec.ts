import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Mind-map Phase 2: exploring a node opens an EMPTY canvas that auto-offers a
// "starting kit" — AI-suggested widgets + a row of browser apps. The AI part
// needs a key/network, so this test exercises the deterministic browser path:
// the kit appears, you pick a browser, and it spawns a webview on the canvas.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

const MAP = JSON.stringify({
  root: {
    id: 'root',
    label: 'Launch plan',
    kind: 'idea',
    children: [{ id: 'c1', label: 'Build the API', kind: 'idea', children: [] }]
  },
  viewRootId: 'root',
  selectedId: null
})

test('empty node-canvas auto-offers a starting kit; a browser quick-add spawns a webview', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.evaluate(async (content: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'Mindmap host' })
    await api.widgets.create({
      taskId: t.id,
      kind: 'mindmap',
      title: '',
      content,
      x: 200,
      y: 140,
      width: 640,
      height: 460
    })
  }, MAP)
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Mindmap host/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(300)

  // Explore the node → empty canvas.
  await window.locator('[data-testid="mindmap-node-c1"]').click()
  await window.waitForTimeout(200)
  await window.evaluate(() => {
    ;(document.querySelector('[data-testid="mindmap-explore"]') as HTMLButtonElement)?.click()
  })
  await window.waitForTimeout(700)

  // The starting kit appears on the empty node canvas.
  await expect(window.locator('[data-testid="mindmap-starting-kit"]')).toBeVisible()

  // Pick a browser (Slack) then add to canvas.
  await window.locator('[data-testid="kit-app-slack"]').click()
  await window.waitForTimeout(150)
  await window.evaluate(() => {
    ;(document.querySelector('[data-testid="kit-add"]') as HTMLButtonElement)?.click()
  })
  await window.waitForTimeout(600)

  // A webview widget pointing at Slack now exists on the node's task canvas.
  const nodeTask = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const all = await api.nodes.list()
    const task = all.find((n) => n.kind === 'task' && n.title === 'Build the API')
    if (!task) return null
    const widgets = await api.widgets.listByTask(task.id)
    return widgets.filter((w) => w.kind === 'webview').map((w) => w.content)
  })
  expect(nodeTask).not.toBeNull()
  expect(nodeTask!.some((url) => /slack\.com/.test(url))).toBe(true)
})
