import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Drag-and-drop test: drag a Connected App from the sidebar onto the canvas
// and verify the resulting webview widget is bound to the source app
// (partition + auto-fill inherit follow from this binding).
//
// We don't use Playwright's native drag mechanics here because the Electron
// renderer's drag handlers read dataTransfer.getData(MIME), which Playwright's
// mouse-drag doesn't populate reliably across HTML5 dnd. Instead we dispatch
// drag events directly on the elements with a real DataTransfer payload —
// which is what HTML5 dnd does under the hood.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('dragging a Connected App onto the canvas creates a webview widget bound to that app', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed: one task to activate the canvas, one connected app to drag.
  const seeded = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({
      parentId: null,
      kind: 'task',
      title: 'Sign emails'
    })
    const app = await api.connectedApps.create({
      title: 'Gmail',
      url: 'https://mail.google.com'
    })
    return { taskId: task.id, appId: app.id, appUrl: app.url, appTitle: app.title }
  })

  // Reload so stores hydrate, then navigate to the task so the canvas mounts.
  await window.reload()
  await waitForReady(window)

  await expect(
    window.getByRole('button', { name: 'Sign emails' }).first()
  ).toBeVisible({ timeout: 5_000 })
  await window.getByRole('button', { name: 'Sign emails' }).first().click()

  // Wait for the canvas drop surface to mount (only mounts when activeTaskId
  // is set — clicking the task in the sidebar triggers the route change that
  // mounts Canvas, which renders the data-canvas-surface element).
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })

  const dropResult = await window.evaluate(async ({ appId }) => {
    const dropTarget = document.querySelector('[data-canvas-surface="true"]')
    if (!dropTarget) return { found: false, message: 'no drop target' }

    const dt = new DataTransfer()
    dt.setData('text/fb-connected-app', appId)
    dt.setData('text/uri-list', 'https://mail.google.com')
    dt.setData('text/plain', 'https://mail.google.com')
    dt.effectAllowed = 'copy'

    const rect = dropTarget.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2

    dropTarget.dispatchEvent(
      new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY })
    )
    dropTarget.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY })
    )
    dropTarget.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY })
    )
    return { found: true, message: 'drop dispatched' }
  }, { appId: seeded.appId })

  expect(dropResult.found).toBe(true)

  // Give the IPC roundtrip a moment to land.
  await window.waitForTimeout(800)

  // Query widgets for the task — there should be a webview widget bound to
  // the connected app.
  const widgets = await window.evaluate(async ({ taskId }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return await api.widgets.listByTask(taskId)
  }, { taskId: seeded.taskId })

  const webviews = widgets.filter((w) => w.kind === 'webview')
  expect(webviews.length).toBeGreaterThanOrEqual(1)
  const bound = webviews.find((w) => w.sourceAppId === seeded.appId)
  expect(bound).toBeDefined()
  // We intentionally don't assert exact URL equality — the webview may have
  // navigated by the time we read it (e.g. Gmail redirecting to /mail/u/0/),
  // and our URL-persistence layer saves the post-redirect URL into widget.content.
  // The invariant that matters: the live URL belongs to the same registrable
  // domain as the seed (mail.google.com → accounts.google.com via OAuth is
  // still google.com). Asserting the registrable suffix instead of exact host
  // makes the test resilient to the SSO/login redirect flow that Gmail does
  // on a fresh machine.
  const widgetHost = new URL(bound!.content).hostname.replace(/^www\./, '')
  const appHost = new URL(seeded.appUrl).hostname.replace(/^www\./, '')
  function registrableDomain(host: string): string {
    const parts = host.split('.')
    return parts.length >= 2 ? parts.slice(-2).join('.') : host
  }
  expect(registrableDomain(widgetHost)).toBe(registrableDomain(appHost))
  // Title may have been overwritten to the page hostname by persistNavUrl
  // when the webview started loading and didn't yet have a real <title>.
  // That's intended — widget.title tracks current page state. We just sanity
  // check it's non-empty.
  expect(bound!.title.length).toBeGreaterThan(0)
})
