import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Drag a persistent-sidebar app row onto the desk canvas and verify it drops a
// real widget of the mapped kind at the drop point. The sidebar's segment app
// rows (the sidenav-<segment>-<app> rows) that map to a genuine canvas widget
// are draggable and set the widget-palette DRAG_MIME payload; the Canvas drop
// handler then runs the same spawn path as the palette.
//
// As in dragDrop.spec.ts we don't drive Playwright's native mouse-drag, because
// the renderer's drop handler reads dataTransfer.getData(MIME) which native
// mouse-drag doesn't populate reliably across HTML5 dnd. Instead we dispatch the
// drag events on the canvas surface with a real DataTransfer, which is what
// HTML5 dnd does under the hood. The DRAG_MIME string must match the value in
// src/renderer/src/lib/widgetCatalog.ts.
const DRAG_MIME = 'application/x-fb-widget-kind'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function openDeskCanvas(app: LaunchedApp): Promise<string> {
  const { window } = app
  await waitForReady(window)

  const taskId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({
      parentId: null,
      kind: 'task',
      title: 'Drag apps here'
    })
    return task.id
  })

  await window.reload()
  await waitForReady(window)

  await expect(
    window.getByRole('button', { name: 'Drag apps here' }).first()
  ).toBeVisible({ timeout: 5_000 })
  await window.getByRole('button', { name: 'Drag apps here' }).first().click()

  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  return taskId
}

async function dispatchDrop(app: LaunchedApp, kind: string): Promise<boolean> {
  return app.window.evaluate((widgetKind) => {
    const dropTarget = document.querySelector('[data-canvas-surface="true"]')
    if (!dropTarget) return false

    const dt = new DataTransfer()
    dt.setData('application/x-fb-widget-kind', widgetKind)
    dt.effectAllowed = 'copy'

    const rect = dropTarget.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2

    for (const type of ['dragenter', 'dragover', 'drop']) {
      dropTarget.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY })
      )
    }
    return true
  }, kind)
}

test('the Draw sidebar app row is draggable and drops a scratchpad widget on the desk', async () => {
  launched = await launchApp()
  const { window } = launched
  const taskId = await openDeskCanvas(launched)

  // The mapped app rows advertise draggable=true; click-only rows do not.
  await expect(window.locator('[data-testid="sidenav-office-draw"]')).toHaveAttribute(
    'draggable',
    'true'
  )

  const before = await window.evaluate(async ({ id }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.widgets.listByTask(id)).length
  }, { id: taskId })

  expect(await dispatchDrop(launched, 'scratchpad')).toBe(true)
  await window.waitForTimeout(800)

  const after = await window.evaluate(async ({ id }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return await api.widgets.listByTask(id)
  }, { id: taskId })

  expect(after.length).toBe(before + 1)
  expect(after.some((w) => w.kind === 'scratchpad')).toBe(true)
  // The created widget also renders on the canvas with its kind data attribute.
  await expect(window.locator('[data-widget-kind="scratchpad"]').first()).toBeVisible({
    timeout: 5_000
  })
})

test('the Mail sidebar app row drops an email widget on the desk', async () => {
  launched = await launchApp()
  const { window } = launched
  const taskId = await openDeskCanvas(launched)

  await expect(window.locator('[data-testid="sidenav-office-mail"]')).toHaveAttribute(
    'draggable',
    'true'
  )

  expect(await dispatchDrop(launched, 'email')).toBe(true)
  await window.waitForTimeout(800)

  const widgets = await window.evaluate(async ({ id }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return await api.widgets.listByTask(id)
  }, { id: taskId })
  expect(widgets.some((w) => w.kind === 'email')).toBe(true)
})

test('clicking a draggable app row still navigates and does not create a widget', async () => {
  launched = await launchApp()
  const { window } = launched
  const taskId = await openDeskCanvas(launched)

  const before = await window.evaluate(async ({ id }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.widgets.listByTask(id)).length
  }, { id: taskId })

  // A normal click on the same draggable row navigates away from the desk — it
  // must not spawn a widget. Drag and click are distinct native events, so
  // making the row draggable leaves click-to-navigate intact. Navigation is
  // observable as the desk canvas surface unmounting.
  await window.locator('[data-testid="sidenav-office-draw"]').click()
  await expect(window.locator('[data-canvas-surface="true"]')).toHaveCount(0, {
    timeout: 8_000
  })

  const after = await window.evaluate(async ({ id }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.widgets.listByTask(id)).length
  }, { id: taskId })
  expect(after).toBe(before)
})

test('a click-only app row (Inbox) is not draggable', async () => {
  launched = await launchApp()
  const { window } = launched
  await openDeskCanvas(launched)

  // Inbox has no natural canvas widget, so it stays click-only navigation.
  await expect(window.locator('[data-testid="sidenav-office-inbox"]')).not.toHaveAttribute(
    'draggable',
    'true'
  )
})
