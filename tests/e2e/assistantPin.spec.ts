/**
 * Click-to-pin (Phase 3a.1): clicking a widget while the assistant is open pins
 * it as the conversation's primary reference — a chip in the composer, the
 * widget's id + content on the request, sticky across sends (P2), one at a
 * time (P1).
 *
 * Far-end stubbing philosophy as the sibling suites: only `chat:sendStream` is
 * swapped, and it records what the renderer really sent. The widget click, the
 * activation signal, the pin store, the chip and the attachment gathering are
 * all shipping code.
 *
 * AP-1  Clicking a widget while the panel is open shows the pin chip (and it
 *       replaces the passive context chip).
 * AP-2  The request genuinely carries the pin: pinnedWidgetId + the widget's
 *       extracted content ride to the main process — and the pin SURVIVES the
 *       send (P2: sticky until dismissed, not per-message).
 * AP-3  × unpins: chip gone, context chip back, next request carries nothing.
 * AP-4  Clicking another widget replaces the pin (P1: one at a time); leaving
 *       the thread (Rooms) clears it — no pin on return.
 * AP-5  A widget clicked while the panel is CLOSED does not pin — the gesture
 *       is "click while the assistant is open", not "have something selected".
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

interface CapturedRequest {
  pinnedWidgetId?: string
  attachmentWidgetIds: string[]
}

async function stubStream(app: ElectronApplication, reply: string): Promise<void> {
  await app.evaluate(({ ipcMain }, replyText: string) => {
    try {
      ipcMain.removeHandler('chat:sendStream')
    } catch {
      /* first install */
    }
    ipcMain.handle(
      'chat:sendStream',
      async (
        e: Electron.IpcMainInvokeEvent,
        input: {
          requestId: string
          pinnedWidgetId?: string
          attachments?: Array<{ widgetId: string }>
        }
      ) => {
        ;(globalThis as Record<string, unknown>).__apLastInput = {
          pinnedWidgetId: input.pinnedWidgetId,
          attachmentWidgetIds: (input.attachments ?? []).map((a) => a.widgetId)
        }
        const channel = `chat:stream:${input.requestId}`
        const send = (type: string, payload: unknown): void => {
          if (!e.sender.isDestroyed()) e.sender.send(channel, { type, payload })
        }
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        await wait(20)
        send('sources', { sources: [], elapsedMs: 10 })
        await wait(20)
        send('reply', replyText)
        await wait(20)
        send('complete', {
          ok: true,
          message: { role: 'assistant', content: replyText, ts: Date.now() }
        })
        return { ok: true }
      }
    )
  }, reply)
}

async function lastCaptured(app: ElectronApplication): Promise<CapturedRequest> {
  return (await app.evaluate(
    () => (globalThis as Record<string, unknown>).__apLastInput
  )) as CapturedRequest
}

async function seedDesk(window: Page): Promise<{ taskId: string; aId: string; bId: string }> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Pin test desk' })
    const a = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'Widget A',
      content: 'ALPHA-CONTENT',
      x: 160,
      y: 160,
      width: 220,
      height: 180
    })
    const b = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'Widget B',
      content: 'BETA-CONTENT',
      x: 460,
      y: 160,
      width: 220,
      height: 180
    })
    return { taskId: task.id, aId: a.id, bId: b.id }
  })
}

// The first boot after seeding is exactly when the feature-spotlight popup
// fires (core onboarding auto-completes for a workspace with data, and the
// unseen feature tours become a login offer). It docks bottom-right at
// z-[230] — directly over the assistant panel these tests drive. Mark today's
// tours as skipped before reloading so the offer never races a click;
// waitForReady also dismisses one reactively as a fallback.
async function suppressFeatureSpotlights(window: Page): Promise<void> {
  await window.evaluate(() => {
    let p: { completed?: Record<string, number>; skipped?: Record<string, number> } = {}
    try {
      p = JSON.parse(localStorage.getItem('fb.onboarding.v2') ?? '{}')
    } catch {
      /* fresh */
    }
    p.skipped = { ...(p.skipped ?? {}), 'rooms-desks': 999, 'office-connect': 999 }
    localStorage.setItem('fb.onboarding.v2', JSON.stringify(p))
  })
}

// Open the seeded desk from a screen that lists it as a real nav button (the
// boot landing does; the Rooms grid renders desks as tiles, not buttons — go
// Home first when returning).
async function openDesk(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Pin test desk' }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForTimeout(500)
}

async function openAssistant(window: Page): Promise<void> {
  await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-assistant')))
  await window.locator('[data-testid="assistant-panel"]').waitFor({ state: 'visible', timeout: 8000 })
}

async function ask(window: Page, text: string): Promise<void> {
  const composer = window.locator('[data-testid="chat-composer"]')
  await composer.fill(text)
  await window.locator('button[aria-label="Send"]').click()
}

const pinChip = (window: Page) => window.locator('[data-testid="composer-pin-chip"]')
const contextChip = (window: Page) => window.locator('[data-testid="composer-context-chip"]')

test('AP-1 + AP-2 — a click pins; the request carries id + content; the pin survives the send', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  const { aId } = await seedDesk(window)
  await suppressFeatureSpotlights(window)
  await window.reload()
  await waitForReady(window)
  await openDesk(window)
  await openAssistant(window)

  // Before any click: the passive context chip, no pin chip.
  await expect(contextChip(window)).toBeVisible()
  await expect(pinChip(window)).toHaveCount(0)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(pinChip(window)).toBeVisible({ timeout: 4000 })
  await expect(pinChip(window)).toContainText('Widget A')
  // The pin chip replaces the passive chip — one statement of scope at a time.
  await expect(contextChip(window)).toHaveCount(0)

  await stubStream(app, 'Answer about the pinned widget.')
  await ask(window, 'what does it say?')
  await expect(window.getByText('Answer about the pinned widget.')).toBeVisible({ timeout: 8000 })

  // The far end really received the pin AND the widget's extracted content.
  const captured = await lastCaptured(app)
  expect(captured.pinnedWidgetId).toBe(aId)
  expect(captured.attachmentWidgetIds).toContain(aId)

  // P2 — a send does NOT clear the pin.
  await expect(pinChip(window)).toBeVisible()
  await expect(pinChip(window)).toContainText('Widget A')
})

test('AP-3 — × unpins: chip gone, context chip back, next request carries nothing', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  const { aId } = await seedDesk(window)
  await suppressFeatureSpotlights(window)
  await window.reload()
  await waitForReady(window)
  await openDesk(window)
  await openAssistant(window)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(pinChip(window)).toBeVisible({ timeout: 4000 })

  await window.locator('[data-testid="composer-pin-clear"]').click()
  await expect(pinChip(window)).toHaveCount(0)
  await expect(contextChip(window)).toBeVisible()

  await stubStream(app, 'Unpinned answer.')
  await ask(window, 'and now?')
  await expect(window.getByText('Unpinned answer.')).toBeVisible({ timeout: 8000 })
  const captured = await lastCaptured(app)
  expect(captured.pinnedWidgetId).toBeUndefined()
})

test('AP-4 — another click replaces the pin; leaving the thread clears it', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const { aId, bId } = await seedDesk(window)
  await suppressFeatureSpotlights(window)
  await window.reload()
  await waitForReady(window)
  await openDesk(window)
  await openAssistant(window)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(pinChip(window)).toContainText('Widget A', { timeout: 4000 })

  // P1 — one pinned item: the newer click wins.
  await window.locator(`[data-widget-id="${bId}"]`).click()
  await expect(pinChip(window)).toContainText('Widget B', { timeout: 4000 })
  await expect(pinChip(window)).not.toContainText('Widget A')

  // A genuine thread switch (Rooms threads under its own key) clears the pin —
  // and coming back does not resurrect it. Return via Home: the Rooms grid
  // renders desks as tiles, not nav buttons.
  await window.getByRole('button', { name: /Rooms/ }).first().click()
  await expect(pinChip(window)).toHaveCount(0, { timeout: 4000 })
  await window.getByRole('button', { name: /Home/ }).first().click()
  await openDesk(window)
  await expect(contextChip(window)).toBeVisible({ timeout: 4000 })
  await expect(pinChip(window)).toHaveCount(0)
})

test('AP-5 — a widget clicked while the panel is closed does not pin', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const { aId, bId } = await seedDesk(window)
  await suppressFeatureSpotlights(window)
  await window.reload()
  await waitForReady(window)
  await openDesk(window)

  // Panel closed (pill state): clicking a widget is just canvas activation.
  await window.locator(`[data-widget-id="${aId}"]`).click()
  await openAssistant(window)
  await expect(contextChip(window)).toBeVisible()
  await expect(pinChip(window)).toHaveCount(0)

  // With the panel now open, a click pins — the same session, the same desk.
  await window.locator(`[data-widget-id="${bId}"]`).click()
  await expect(pinChip(window)).toContainText('Widget B', { timeout: 4000 })
})
