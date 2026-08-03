/**
 * @-mentions end to end (Phase 4.3), and the click-to-pin path they absorbed.
 *
 * Phase 3a.1 shipped click-to-pin: one widget, pinned as the conversation's
 * primary reference. Phase 4 generalised it (plan D7/D8) — a click and a typed
 * "@" now produce the SAME kind of chip in the SAME layer, several at a time,
 * all sticky to the conversation. These locks are the 3a.1 suite (AP-1…AP-5)
 * rewritten onto that model, plus the typeahead the pin never had. Each was run
 * against the pre-change build first, where the mention selectors do not exist.
 *
 * Same far-end stubbing philosophy as the sibling suites: only `chat:sendStream`
 * is swapped, and it records what the renderer really sent. The widget click,
 * the activation signal, the store, the chips, the typeahead and the attachment
 * gathering are all shipping code.
 *
 * AM-1  A click makes a reference chip, and the request genuinely carries it —
 *       both as a typed mention and as the widget's extracted content.
 * AM-2  The reference SURVIVES the send (plan D8: sticky to the conversation,
 *       not consumed by a message).
 * AM-3  × removes it: chip gone, context chip back, next request carries none.
 * AM-4  A second click ADDS a second reference rather than replacing the first
 *       — the behaviour that deliberately changed from AP-4 — and both ride.
 * AM-5  A widget clicked while the panel is CLOSED does not reference.
 * AM-6  Typing "@" opens the picker over real workspace objects; choosing one
 *       puts a chip INSIDE the sentence and sends it with the message.
 * AM-7  A reference the main process reports as unresolvable renders visibly
 *       broken instead of live.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { composerText, launchApp, type LaunchedApp, typeInComposer, waitForReady } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

interface CapturedRequest {
  pinnedWidgetId?: string
  mentionIds: string[]
  mentionKinds: string[]
  attachmentWidgetIds: string[]
}

async function stubStream(
  app: ElectronApplication,
  reply: string,
  // When set, the completed response reports these mention ids as unresolvable,
  // which is the only thing that may make a chip render broken.
  unresolved: string[] = [],
  // Emit retrieved sources too, so the two lanes can be told apart.
  withSources = false
): Promise<void> {
  await app.evaluate(
    (
      { ipcMain },
      {
        replyText,
        unresolvedIds,
        withSources
      }: { replyText: string; unresolvedIds: string[]; withSources: boolean }
    ) => {
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
            mentions?: Array<{ kind: string; id: string; title: string }>
            attachments?: Array<{ widgetId: string }>
          }
        ) => {
          const mentions = input.mentions ?? []
          ;(globalThis as Record<string, unknown>).__amLastInput = {
            pinnedWidgetId: input.pinnedWidgetId,
            mentionIds: mentions.map((m) => m.id),
            mentionKinds: mentions.map((m) => m.kind),
            attachmentWidgetIds: (input.attachments ?? []).map((a) => a.widgetId)
          }
          const channel = `chat:stream:${input.requestId}`
          const send = (type: string, payload: unknown): void => {
            if (!e.sender.isDestroyed()) e.sender.send(channel, { type, payload })
          }
          const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
          const resolutions = mentions.map((m) => ({
            kind: m.kind,
            id: m.id,
            title: m.title,
            resolved: !unresolvedIds.includes(m.id),
            chars: unresolvedIds.includes(m.id) ? 0 : 42,
            truncated: false,
            reason: unresolvedIds.includes(m.id) ? 'this widget no longer exists' : null
          }))
          await wait(20)
          // Resolution really does precede retrieval in the main process, and
          // the stream reports it in that order.
          if (resolutions.length > 0) send('mentions', resolutions)
          await wait(20)
          send('sources', {
            sources: withSources
              ? [
                  { n: 1, docId: 'doc-1', title: 'A retrieved doc', docType: 'document', snippet: 's1' },
                  { n: 2, docId: 'doc-2', title: 'Another retrieved doc', docType: 'document', snippet: 's2' }
                ]
              : [],
            elapsedMs: 10
          })
          await wait(20)
          send('reply', replyText)
          await wait(20)
          send('complete', {
            ok: true,
            message: { role: 'assistant', content: replyText, ts: Date.now() },
            mentions: resolutions
          })
          return { ok: true }
        }
      )
    },
    { replyText: reply, unresolvedIds: unresolved, withSources }
  )
}

async function lastCaptured(app: ElectronApplication): Promise<CapturedRequest> {
  return (await app.evaluate(
    () => (globalThis as Record<string, unknown>).__amLastInput
  )) as CapturedRequest
}

async function seedDesk(window: Page): Promise<{ taskId: string; aId: string; bId: string }> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({
      parentId: null,
      kind: 'task',
      title: 'Mention test desk'
    })
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
// fires. It docks bottom-right at z-[230] — directly over the assistant panel
// these tests drive. Mark today's tours as skipped before reloading so the
// offer never races a click; waitForReady also dismisses one reactively.
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

async function openDesk(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Mention test desk' }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })
  await window.waitForTimeout(500)
}

async function openAssistant(window: Page): Promise<void> {
  await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-assistant')))
  await window
    .locator('[data-testid="assistant-panel"]')
    .waitFor({ state: 'visible', timeout: 8000 })
}

async function ask(window: Page, text: string): Promise<void> {
  await typeInComposer(window, text)
  await window.locator('button[aria-label="Send"]').click()
}

const refRow = (window: Page) => window.locator('[data-testid="composer-mention-row"]')
const refChips = (window: Page) => window.locator('[data-testid="composer-mention-ref"]')
const contextChip = (window: Page) => window.locator('[data-testid="composer-context-chip"]')

async function boot(): Promise<{ window: Page; app: ElectronApplication; aId: string; bId: string }> {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  const { aId, bId } = await seedDesk(window)
  await suppressFeatureSpotlights(window)
  await window.reload()
  await waitForReady(window)
  await openDesk(window)
  return { window, app, aId, bId }
}

test('AM-1 + AM-2 — a click references; the request carries it; it survives the send', async () => {
  const { window, app, aId } = await boot()
  await openAssistant(window)

  // Before any click: the passive context chip, no references.
  await expect(contextChip(window)).toBeVisible()
  await expect(refChips(window)).toHaveCount(0)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(refRow(window)).toBeVisible({ timeout: 4000 })
  await expect(refChips(window)).toHaveCount(1)
  await expect(refChips(window).first()).toContainText('Widget A')
  // The reference row replaces the passive chip — one statement of scope.
  await expect(contextChip(window)).toHaveCount(0)

  await stubStream(app, 'Answer about the referenced widget.')
  await ask(window, 'what does it say?')
  await expect(window.getByText('Answer about the referenced widget.')).toBeVisible({
    timeout: 8000
  })

  // The far end really received it as a typed mention AND as extracted content.
  const captured = await lastCaptured(app)
  expect(captured.mentionIds).toContain(aId)
  expect(captured.mentionKinds).toContain('widget')
  expect(captured.attachmentWidgetIds).toContain(aId)

  // AM-2 (plan D8) — a send does NOT consume the reference.
  await expect(refChips(window)).toHaveCount(1)
  await expect(refChips(window).first()).toContainText('Widget A')
})

test('AM-3 — × removes it: chip gone, context chip back, next request carries none', async () => {
  const { window, app, aId } = await boot()
  await openAssistant(window)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(refChips(window)).toHaveCount(1, { timeout: 4000 })

  await window.locator('[data-testid="composer-mention-clear"]').first().click()
  await expect(refChips(window)).toHaveCount(0)
  await expect(contextChip(window)).toBeVisible()

  await stubStream(app, 'Unreferenced answer.')
  await ask(window, 'and now?')
  await expect(window.getByText('Unreferenced answer.')).toBeVisible({ timeout: 8000 })
  const captured = await lastCaptured(app)
  expect(captured.mentionIds).toEqual([])
  expect(captured.pinnedWidgetId).toBeUndefined()
})

test('AM-4 — a second click ADDS a second reference; both ride the request', async () => {
  const { window, app, aId, bId } = await boot()
  await openAssistant(window)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(refChips(window)).toHaveCount(1, { timeout: 4000 })

  // The deliberate change from 3a.1's AP-4, which locked the opposite: the
  // layer holds several references, so a second click adds rather than
  // replaces. ("You can @ mention multiple documents and they are referenced
  // immediately together.")
  await window.locator(`[data-widget-id="${bId}"]`).click()
  await expect(refChips(window)).toHaveCount(2, { timeout: 4000 })
  await expect(refRow(window)).toContainText('Widget A')
  await expect(refRow(window)).toContainText('Widget B')

  await stubStream(app, 'Answer about both.')
  await ask(window, 'compare them')
  await expect(window.getByText('Answer about both.')).toBeVisible({ timeout: 8000 })
  const captured = await lastCaptured(app)
  expect(captured.mentionIds).toContain(aId)
  expect(captured.mentionIds).toContain(bId)
})

test('AM-5 — a widget clicked while the panel is closed does not reference', async () => {
  const { window, aId, bId } = await boot()

  // Panel closed (pill state): clicking a widget is just canvas activation.
  await window.locator(`[data-widget-id="${aId}"]`).click()
  await openAssistant(window)
  await expect(contextChip(window)).toBeVisible()
  await expect(refChips(window)).toHaveCount(0)

  // With the panel now open, a click references — same session, same desk.
  await window.locator(`[data-widget-id="${bId}"]`).click()
  await expect(refChips(window)).toHaveCount(1, { timeout: 4000 })
  await expect(refRow(window)).toContainText('Widget B')
})

test('AM-6 — typing @ picks a real workspace object, inline in the sentence', async () => {
  const { window, app } = await boot()
  await openAssistant(window)

  // Type a sentence and open the picker mid-way through it — the whole point of
  // inline chips is that they sit where you were typing, not in a separate rail.
  await typeInComposer(window, 'compare @Widget A')
  const picker = window.locator('[data-testid="mention-picker"]')
  await expect(picker).toBeVisible({ timeout: 6000 })
  const option = window.locator('[data-testid="mention-option"]').first()
  await expect(option).toContainText('Widget A', { timeout: 6000 })
  await option.click()

  // The chip landed INSIDE the composer's text, and the "@Widget A" query text
  // it replaced is gone.
  await expect(window.locator('[data-testid="composer-mention-chip"]')).toHaveCount(1, {
    timeout: 4000
  })
  expect(await composerText(window)).toContain('compare')
  // And the same reference appears in the live row, because both render one set.
  await expect(refChips(window)).toHaveCount(1)

  await stubStream(app, 'Answer from the typed mention.')
  await window.keyboard.type('against last quarter')
  await window.locator('button[aria-label="Send"]').click()
  await expect(window.getByText('Answer from the typed mention.')).toBeVisible({ timeout: 8000 })

  const captured = await lastCaptured(app)
  expect(captured.mentionIds.length).toBeGreaterThan(0)
  // The sent turn shows the chip back inline, where it was typed.
  await expect(window.locator('[data-testid="turn-mention-chip"]')).toHaveCount(1, {
    timeout: 4000
  })
})

test('AM-7 — a reference the assistant could not read renders broken, not live', async () => {
  const { window, app, aId } = await boot()
  await openAssistant(window)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(refChips(window)).toHaveCount(1, { timeout: 4000 })
  // Live until proven otherwise: nothing has reported on it yet.
  await expect(refChips(window).first()).toHaveAttribute('data-mention-resolved', 'true')

  // The response reports it produced nothing.
  await stubStream(app, 'I could not read that.', [aId])
  await ask(window, 'what does it say?')
  await expect(window.getByText('I could not read that.')).toBeVisible({ timeout: 8000 })

  await expect(refChips(window).first()).toHaveAttribute('data-mention-resolved', 'false', {
    timeout: 4000
  })
})

test('AM-8 — the trace shows a Mentioned lane above Retrieved, and [n] still means retrieval', async () => {
  const { window, app, aId } = await boot()
  await openAssistant(window)

  await window.locator(`[data-widget-id="${aId}"]`).click()
  await expect(refChips(window)).toHaveCount(1, { timeout: 4000 })

  await stubStream(app, 'Grounded in both.', [], true)
  await ask(window, 'what does it say?')
  await expect(window.getByText('Grounded in both.')).toBeVisible({ timeout: 8000 })

  const mentionLane = window.locator('[data-trace-line="mentions"]')
  const retrieveLane = window.locator('[data-trace-line="retrieve"]')
  await expect(mentionLane).toBeVisible({ timeout: 8000 })
  await expect(retrieveLane).toBeVisible()
  await expect(mentionLane).toContainText('you referenced')
  await expect(mentionLane).toContainText('Widget A')

  // The lane leads — resolution genuinely happens before retrieval.
  const laneOrder = await window.evaluate(() =>
    Array.from(document.querySelectorAll('[data-trace-line]')).map((el) =>
      el.getAttribute('data-trace-line')
    )
  )
  expect(laneOrder.indexOf('mentions')).toBeLessThan(laneOrder.indexOf('retrieve'))

  // Plan D3's whole point: the mention takes no citation number, so retrieval's
  // numbering still starts at 1 and an inline [1] means the first RETRIEVED doc.
  await expect(retrieveLane).toContainText('A retrieved doc')
  const mentionLaneText = await mentionLane.innerText()
  expect(mentionLaneText).not.toMatch(/\b1\b\s*Widget A/)
})
