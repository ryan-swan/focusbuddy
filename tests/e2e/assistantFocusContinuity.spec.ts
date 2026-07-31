/**
 * Focus-chat continuity (Phase 3a.3, P5 slice a): the focus AI Chat's empty
 * state offers one tap to continue the desk assistant's conversation — the
 * thread is copied into a NEW persisted conversation, announced as imported,
 * turns verbatim.
 *
 * Only `chat:sendStream` is stubbed (to put real turns in the desk thread);
 * the focus dock, the import builder, the persisted aiChat storage and the
 * offer UI are all shipping code.
 *
 * FC-1  Before any desk conversation exists, the AI Chat tab shows no offer.
 *       After a desk exchange, it does — and one tap imports the thread:
 *       header announcing the import + both turns, persisted to history.
 *       "New chat" then shows the offer again (a fresh import target), with
 *       the imported copy still in history.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, typeInComposer, waitForReady } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function stubStream(app: ElectronApplication, reply: string): Promise<void> {
  await app.evaluate(({ ipcMain }, replyText: string) => {
    try {
      ipcMain.removeHandler('chat:sendStream')
    } catch {
      /* first install */
    }
    ipcMain.handle(
      'chat:sendStream',
      async (e: Electron.IpcMainInvokeEvent, input: { requestId: string }) => {
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

async function enterFocusMode(window: Page, widgetId: string): Promise<void> {
  const widgetEl = window.locator(`[data-widget-id="${widgetId}"]`).first()
  await widgetEl.hover()
  await widgetEl.locator('button[aria-label="Expand options"]').click({ force: true })
  await window.getByText('Focus mode', { exact: true }).click({ force: true })
  await expect(window.locator('[data-testid="widget-focus-mode"]')).toBeVisible({ timeout: 5000 })
}

async function openFocusChatTab(window: Page): Promise<void> {
  await window.locator('[data-testid="focus-dock-chrome-chat"]').click()
  await expect(window.locator('[data-testid="focus-chat-surface"]')).toBeVisible({ timeout: 5000 })
}

test('FC-1 — the desk thread imports into a persisted focus conversation, honestly announced', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)

  const { aId } = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({
      parentId: null,
      kind: 'task',
      title: 'Continuity desk'
    })
    const a = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'Widget A',
      content: 'ALPHA',
      x: 160,
      y: 160,
      width: 220,
      height: 180
    })
    return { aId: a.id }
  })
  await suppressFeatureSpotlights(window)
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: 'Continuity desk' }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })

  // No desk conversation yet → the AI Chat tab offers nothing to continue.
  await enterFocusMode(window, aId)
  await openFocusChatTab(window)
  await expect(window.locator('[data-testid="focus-chat-continue-desk"]')).toHaveCount(0)
  await window.keyboard.press('Escape')
  await expect(window.locator('[data-testid="widget-focus-mode"]')).toHaveCount(0, {
    timeout: 5000
  })

  // Have a real exchange in the desk panel (far end stubbed, renderer real).
  await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-assistant')))
  await expect(window.locator('[data-testid="assistant-panel"]')).toBeVisible({ timeout: 8000 })
  await stubStream(app, 'The desk answer.')
  await typeInComposer(window, 'the desk question')
  await window.locator('button[aria-label="Send"]').click()
  await expect(window.getByText('The desk answer.')).toBeVisible({ timeout: 8000 })

  // Back into focus mode → the offer is there, naming the turn count.
  await enterFocusMode(window, aId)
  await openFocusChatTab(window)
  const offer = window.locator('[data-testid="focus-chat-continue-desk"]')
  await expect(offer).toBeVisible({ timeout: 5000 })
  await expect(offer).toContainText('2-turn')

  // One tap imports: the announced header plus both turns, verbatim.
  await offer.click()
  const thread = window.locator('[data-testid="focus-chat-thread"]')
  await expect(thread).toContainText('Imported from your desk conversation', { timeout: 8000 })
  await expect(thread).toContainText('Continuity desk')
  await expect(thread).toContainText('the desk question')
  await expect(thread).toContainText('The desk answer.')

  // It persisted as a real conversation, announced as imported in its title.
  const persisted = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const list = await api.aiChat.listConversations()
    return { count: list.length, title: list[0]?.title ?? '' }
  })
  expect(persisted.count).toBe(1)
  expect(persisted.title).toContain('Imported')
  expect(persisted.title).toContain('Continuity desk')

  // A fresh "New chat" empties the surface — the offer returns (the desk
  // thread still exists), and the imported copy stays in history.
  await window.locator('[data-testid="focus-chat-new"]').click()
  await expect(offer).toBeVisible({ timeout: 5000 })
  await window.locator('[data-testid="focus-chat-history-toggle"]').click()
  await expect(
    window.locator('[data-testid="focus-chat-history"]')
  ).toContainText('Imported — Continuity desk', { timeout: 5000 })
})
