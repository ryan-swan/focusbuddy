import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Gestures performed on the widget HEADER — which is react-rnd's drag handle, so
// a normal mousedown is consumed by the drag machinery and onClick never fires.
// These must be driven with a REAL mouse (not a synthetic click) to exercise the
// onMouseDownCapture path where header shift-select and ⌘-dive are wired.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

const zoomNow = (w: import('@playwright/test').Page): Promise<number> =>
  w.evaluate(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('[data-bare-canvas]')).find(
      (e) => !e.hasAttribute('data-canvas-surface')
    )
    return parseFloat(el!.style.transform.match(/scale\(([0-9.]+)\)/)?.[1] || '1')
  })

async function seedAndOpen(l: LaunchedApp): Promise<string> {
  const { window } = l
  await waitForReady(window)
  const seeded = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'HeaderGest' })
    const w = await api.widgets.create({
      taskId: t.id,
      kind: 'sticky',
      title: 's',
      content: 's',
      x: 400,
      y: 300,
      width: 200,
      height: 160
    })
    return w.id
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /HeaderGest/ }).first().click()
  await window.waitForSelector(`[data-widget-id="${seeded}"]`)
  await window.waitForTimeout(300)
  return seeded
}

async function headerPoint(l: LaunchedApp, id: string): Promise<{ x: number; y: number }> {
  return l.window.evaluate((wid: string) => {
    const h = document.querySelector(`[data-widget-id="${wid}"] .widget-handle`)!
    const b = (h as HTMLElement).getBoundingClientRect()
    return { x: b.left + 20, y: b.top + b.height / 2 } // title area, not the centre icon
  }, id)
}

test('Cmd-click on the header dives in (zoom→1) when zoomed out', async () => {
  launched = await launchApp()
  const { window } = launched
  const id = await seedAndOpen(launched)

  for (let i = 0; i < 8; i++) {
    await window.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        x.title?.startsWith('Zoom out')
      )
      b?.click()
    })
    await window.waitForTimeout(40)
  }
  expect(await zoomNow(window)).toBeLessThan(0.8)

  const pt = await headerPoint(launched, id)
  await window.keyboard.down('Meta')
  await window.mouse.click(pt.x, pt.y)
  await window.keyboard.up('Meta')
  await window.waitForTimeout(300)

  expect(await zoomNow(window)).toBeCloseTo(1, 1)
})

test('Shift-click on the header toggles selection (no drag)', async () => {
  launched = await launchApp()
  const { window } = launched
  const id = await seedAndOpen(launched)

  const pt = await headerPoint(launched, id)
  await window.keyboard.down('Shift')
  await window.mouse.click(pt.x, pt.y)
  await window.keyboard.up('Shift')
  await window.waitForTimeout(150)

  expect(await window.evaluate(() => document.body.innerText)).toContain('1 selected')
})
