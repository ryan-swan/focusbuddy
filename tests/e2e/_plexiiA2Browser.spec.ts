import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// A2 desk-browser unification probe (Caleb's four picks, 2026-08-23): the
// desk's browser widget and the panel/fullscreen surface are ONE browser —
// shared BrowserSurface core (toolbar grammar + address bar + engine chip),
// one cookie jar (persist:webview-default), hand-off both directions.
// Throwaway; delete when A2 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'
const CMD_K = process.platform === 'darwin' ? 'Meta+k' : 'Control+k'

async function seedDesk(
  window: import('@playwright/test').Page,
  withWidget: boolean
): Promise<{ taskId: string; widgetId: string | null }> {
  return window.evaluate(async (seedWidget) => {
    const nodeStore = (
      window as unknown as {
        __fbNodes: { getState: () => { create: (d: unknown) => Promise<{ id: string }> } }
      }
    ).__fbNodes
    const t = await nodeStore.getState().create({
      parentId: null,
      kind: 'task',
      title: 'Unification Desk'
    })
    let widgetId: string | null = null
    if (seedWidget) {
      const widgetStore = (
        window as unknown as {
          __fbWidgets: { getState: () => { create: (d: unknown) => Promise<{ id: string }> } }
        }
      ).__fbWidgets
      const w = await widgetStore.getState().create({
        taskId: t.id,
        kind: 'webview',
        title: '',
        content: 'https://example.com/',
        x: 120,
        y: 120,
        width: 640,
        height: 480,
        color: null
      })
      widgetId = w.id
    }
    const view = window as unknown as {
      __fbView?: { getState: () => { goTask: (id: string) => void } }
      __fbNodes: { getState: () => { setActive: (id: string) => void } }
    }
    view.__fbNodes.getState().setActive(t.id)
    view.__fbView?.getState().goTask(t.id)
    return { taskId: t.id, widgetId }
  }, withWidget)
}

test('unified surface: the desk widget wears the one toolbar, searches the pinned engine, hands off to fullscreen', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  window.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(
    (t) => localStorage.setItem('fb.theme.mode', t),
    process.env.SHOT_THEME ?? 'dark'
  )
  await window.reload()
  await waitForReady(window)

  const { widgetId } = await seedDesk(window, true)
  const widget = window.locator(`[data-widget-id="${widgetId}"]`)
  await expect(widget).toBeVisible()

  // The unified toolbar grammar on the WIDGET: address bar, engine chip, the
  // explicit system-browser escape, and the fullscreen hand-off.
  const address = widget.locator('[data-testid="browser-address"]')
  await expect(address).toBeVisible()
  await expect(address).toHaveValue(/example\.com/)
  await expect(widget.locator('[data-testid="web-panel-engine-toggle"]')).toBeVisible()
  await expect(widget.locator('[data-testid="browser-external"]')).toBeVisible()
  await expect(widget.locator('[data-testid="widget-browser-fullscreen"]')).toBeVisible()

  // ONE cookie jar: the freeform widget rides persist:webview-default.
  expect(await widget.locator('webview').getAttribute('partition')).toBe(
    'persist:webview-default'
  )
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/browser-1-widget-unified.png` })

  // The address bar searches the PINNED engine on non-URL input (the widget
  // used to hard-code Google; unification routes it through AI-02's store).
  await address.click()
  await address.fill('standing desk chairs')
  await window.keyboard.press('Enter')
  await expect(address).toHaveValue(/duckduckgo\.com/, { timeout: 20000 })
  await window.screenshot({ path: `${OUT}/browser-2-widget-search.png` })

  // Hand-off: the same page opens edge-to-edge in the fullscreen surface.
  await widget.locator('[data-testid="widget-browser-fullscreen"]').click()
  const panel = window.locator('[data-testid="web-panel"]')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-expanded', 'true')
  await expect(panel.locator('[data-testid="browser-address"]')).toHaveValue(/duckduckgo\.com/, {
    timeout: 20000
  })
  // The panel rides the SAME cookie jar — that is what "one browser" means.
  expect(await panel.locator('webview').getAttribute('partition')).toBe('persist:webview-default')
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/browser-3-fullscreen-handoff.png` })

  // Esc steps down: fullscreen → panel → closed (unchanged law).
  await window.keyboard.press('Escape')
  await expect(panel).toHaveAttribute('data-expanded', 'false')
  await window.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await launched.dispose()
})

test('send-to-desk: the panel plants its live page as a browser widget on the open desk, selected', async () => {
  const launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  window.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(
    (t) => localStorage.setItem('fb.theme.mode', t),
    process.env.SHOT_THEME ?? 'dark'
  )
  await window.reload()
  await waitForReady(window)

  await seedDesk(window, false)

  // A deliberate search opens the fullscreen surface (Caleb's default).
  await window.keyboard.press(CMD_K)
  const input = window.locator('[data-testid="command-palette-input"]')
  await expect(input).toBeVisible()
  await input.fill('standing desk setups')
  await window.locator('[data-testid="palette-row-omni-search"]').click()
  const panel = window.locator('[data-testid="web-panel"]')
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-testid="browser-address"]')).toHaveValue(/duckduckgo\.com/, {
    timeout: 20000
  })

  // With a desk open, send-to-desk is offered; the page lands as a widget.
  const send = window.locator('[data-testid="web-panel-send-to-desk"]')
  await expect(send).toBeVisible()
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/browser-4-send-to-desk-offered.png` })
  await send.click()
  await expect(panel).toHaveCount(0)

  const planted = await window.evaluate(() => {
    const store = (
      window as unknown as {
        __fbWidgets: {
          getState: () => {
            widgets: { id: string; kind: string; content: string }[]
            selectedIds: string[]
          }
        }
      }
    ).__fbWidgets
    const s = store.getState()
    const w = s.widgets.find((x) => x.kind === 'webview' && /duckduckgo\.com/.test(x.content))
    return w ? { id: w.id, selected: s.selectedIds.includes(w.id) } : null
  })
  expect(planted).not.toBeNull()
  expect(planted!.selected).toBe(true)
  await expect(window.locator(`[data-widget-id="${planted!.id}"]`)).toBeVisible()
  await window.waitForTimeout(400)
  await window.screenshot({ path: `${OUT}/browser-5-planted-widget.png` })

  await launched.dispose()
})
