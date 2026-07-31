/**
 * The follow-up question card, end to end.
 *
 * Same stubbing philosophy as assistantRetrievalTrace.spec.ts: only the model
 * is faked, at the far end — the real `chat:sendStream` handler is swapped for
 * one that plays a scripted event sequence (including a `complete` carrying a
 * `question`) onto the real per-request channel. The preload bridge, the store,
 * the activeQuestionFor derivation and the card component are all shipping code.
 *
 * QC-0  The panel's request really opts in: `supportsQuestions: true` reaches
 *       the main-process handler. Without this the prompt never teaches the
 *       model to ask and everything downstream is dead code.
 * QC-1  A question in the completed response renders a card above the composer;
 *       picking an option and sending it becomes a normal user turn and the
 *       card goes away.
 * QC-2  Typing in the composer is the free-text escape: any send on the thread
 *       retires the card.
 * QC-3  The × dismisses the card without producing a turn, and it stays gone —
 *       including across navigation.
 * QC-4  Navigation neither loses nor duplicates a live question: away to Rooms
 *       (a genuine thread switch), back, and the card is exactly there again.
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

interface QuestionScript {
  reply?: string
  question?: { prompt: string; options: string[]; allowFreeText?: boolean }
}

// Swap the real handler for a scripted one. Also records the last request the
// renderer actually sent (for the opt-in lock QC-0) on globalThis, where a
// later evaluate can read it back.
async function stubStream(app: ElectronApplication, script: QuestionScript): Promise<void> {
  await app.evaluate(({ ipcMain }, s: QuestionScript) => {
    try {
      ipcMain.removeHandler('chat:sendStream')
    } catch {
      /* first install — nothing to remove */
    }
    ipcMain.handle(
      'chat:sendStream',
      async (
        e: Electron.IpcMainInvokeEvent,
        input: { requestId: string; supportsQuestions?: boolean }
      ) => {
        ;(globalThis as Record<string, unknown>).__qcLastInput = {
          supportsQuestions: input.supportsQuestions
        }
        const channel = `chat:stream:${input.requestId}`
        const send = (type: string, payload: unknown): void => {
          if (!e.sender.isDestroyed()) e.sender.send(channel, { type, payload })
        }
        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        const q = s.question
          ? {
              prompt: s.question.prompt,
              options: s.question.options,
              allowFreeText: s.question.allowFreeText !== false
            }
          : undefined
        await wait(20)
        send('sources', { sources: [], elapsedMs: 12 })
        if (s.reply !== undefined) {
          await wait(30)
          send('reply', s.reply)
        }
        if (q) {
          await wait(30)
          send('question', q)
        }
        await wait(30)
        send('complete', {
          ok: true,
          message: { role: 'assistant', content: s.reply ?? '', ts: Date.now() },
          question: q
        })
        return { ok: true }
      }
    )
  }, script)
}

async function openAssistant(window: Page): Promise<void> {
  await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-assistant')))
  await window.locator('[data-testid="assistant-panel"]').waitFor({ state: 'visible', timeout: 8000 })
}

async function ask(window: Page, text: string): Promise<void> {
  await typeInComposer(window, text)
  await window.locator('button[aria-label="Send"]').click()
}

const DESK_QUESTION = {
  prompt: 'Which desk should this tracker go on?',
  options: ['Marketing desk', 'A new desk'],
  allowFreeText: true
}

test('QC-0 — the panel really opts in: supportsQuestions reaches the main handler', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, { reply: 'plain answer' })
  await ask(window, 'anything at all')
  await expect(window.getByText('plain answer')).toBeVisible({ timeout: 8000 })

  const lastInput = await app.evaluate(
    () => (globalThis as Record<string, unknown>).__qcLastInput
  )
  expect(lastInput).toEqual({ supportsQuestions: true })
})

test('QC-1 — a question renders as a card; picking an option answers as a normal turn', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, { reply: 'One thing first.', question: DESK_QUESTION })
  await ask(window, 'set up a lead tracker')

  const card = window.locator('[data-testid="assistant-question-card"]')
  await expect(card).toBeVisible({ timeout: 8000 })
  await expect(card).toContainText('Which desk should this tracker go on?')
  await expect(window.locator('[data-testid="question-option"]')).toHaveCount(2)
  // The free-text escape is announced, since allowFreeText is true.
  await expect(card).toContainText('Or describe it your own way')

  // Send is disabled until a choice is made — no empty answers.
  const sendAnswer = window.locator('[data-testid="question-send"]')
  await expect(sendAnswer).toBeDisabled()

  // The answer round-trips through the normal send path; re-script the stub so
  // the follow-up gets a plain reply.
  await stubStream(app, { reply: 'Done — tracker on the Marketing desk.' })
  await window.locator('[data-testid="question-option"]').first().check()
  await expect(sendAnswer).toBeEnabled()
  await sendAnswer.click()

  // The chosen option became the user's turn, verbatim.
  await expect(window.locator('[data-testid="user-turn"]').last()).toContainText(
    'Marketing desk',
    { timeout: 8000 }
  )
  // The follow-up answer arrived, and the card is gone.
  await expect(window.getByText('Done — tracker on the Marketing desk.')).toBeVisible({
    timeout: 8000
  })
  await expect(card).toHaveCount(0)
})

test('QC-2 — typing in the composer is the free-text escape and retires the card', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, { reply: 'One thing first.', question: DESK_QUESTION })
  await ask(window, 'set up a lead tracker')
  await expect(window.locator('[data-testid="assistant-question-card"]')).toBeVisible({
    timeout: 8000
  })

  await stubStream(app, { reply: 'Understood — using the Ops desk.' })
  await ask(window, 'actually put it on the Ops desk')

  await expect(window.getByText('Understood — using the Ops desk.')).toBeVisible({ timeout: 8000 })
  await expect(window.locator('[data-testid="assistant-question-card"]')).toHaveCount(0)
})

test('QC-3 — dismissing the card produces no turn and it stays dismissed', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, { reply: 'One thing first.', question: DESK_QUESTION })
  await ask(window, 'set up a lead tracker')

  const card = window.locator('[data-testid="assistant-question-card"]')
  await expect(card).toBeVisible({ timeout: 8000 })
  const turnsBefore = await window.locator('[data-testid="user-turn"]').count()

  await window.locator('[data-testid="question-dismiss"]').click()
  await expect(card).toHaveCount(0)
  // No synthetic turn was produced by dismissing.
  await expect(window.locator('[data-testid="user-turn"]')).toHaveCount(turnsBefore)

  // Navigate away and back — a dismissed question must not resurrect.
  await window.getByRole('button', { name: /Rooms/ }).first().click()
  await expect(window.locator('[data-testid="assistant-turn"]')).toHaveCount(0, { timeout: 6000 })
  await window.getByRole('button', { name: /Home/ }).first().click()
  await expect(window.locator('[data-testid="assistant-turn"]')).toHaveCount(1, { timeout: 8000 })
  await expect(card).toHaveCount(0, { timeout: 700 })
})

test('QC-4 — navigation neither loses nor duplicates a live question', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, { reply: 'One thing first.', question: DESK_QUESTION })
  await ask(window, 'set up a lead tracker')

  const card = window.locator('[data-testid="assistant-question-card"]')
  await expect(card).toBeVisible({ timeout: 8000 })

  // Rooms threads under its own key — a genuine thread switch. The rooms
  // thread has no conversation and no question. (Calendar and Home both fall
  // through to __global__ and would switch nothing — see ART-8.)
  await window.getByRole('button', { name: /Rooms/ }).first().click()
  await expect(window.locator('[data-testid="assistant-turn"]')).toHaveCount(0, { timeout: 6000 })
  await expect(card).toHaveCount(0)

  // Back home: the conversation remounts and the card is exactly there again —
  // one card, same prompt, still answerable.
  await window.getByRole('button', { name: /Home/ }).first().click()
  await expect(window.locator('[data-testid="assistant-turn"]')).toHaveCount(1, { timeout: 8000 })
  await expect(card).toHaveCount(1, { timeout: 700 })
  await expect(card).toContainText('Which desk should this tracker go on?')
})
