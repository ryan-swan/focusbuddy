import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The retrieval trace, end to end.
//
// Only the model is faked, and it is faked at the far end: the real
// `chat:sendStream` main-process handler is swapped for one that plays a
// scripted event sequence onto the real per-request channel. Everything after
// that is the shipping code — the preload bridge, the channel naming, the event
// decoding, the store, the derivation and the component. That matters, because
// the contract under test is "the UI may only show what the server reported",
// and stubbing nearer the UI would test the stub instead.
//
// (Stubbing in the renderer is not an option anyway: contextBridge deep-freezes
// window.api, so assigning over api.chat.* silently does nothing.)
//
// e2e here is hermetic by design — _helpers strips the AI keys from the env —
// so a real key would neither be available nor deterministic.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

interface StreamScript {
  sources?: Array<{ n: number; docId: string; title: string; docType: string; snippet: string }>
  elapsedMs?: number
  reply?: string
  tools?: Array<{ index: number; kind: string; label: string }>
  // Emitted instead of `complete` when set.
  error?: string
}

// Replace the real handler with a scripted one. Events go out on the same
// channel, in the same shape and the same order the real one uses.
async function stubStream(app: ElectronApplication, script: StreamScript): Promise<void> {
  await app.evaluate(({ ipcMain }, s: StreamScript) => {
    try {
      ipcMain.removeHandler('chat:sendStream')
    } catch {
      /* first install — nothing to remove */
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
        send('sources', { sources: s.sources ?? [], elapsedMs: s.elapsedMs ?? 240 })
        if (s.reply !== undefined) {
          await wait(40)
          send('reply', s.reply)
        }
        for (const t of s.tools ?? []) {
          await wait(40)
          send('tool', t)
        }
        await wait(40)
        if (s.error !== undefined) {
          send('error', { ok: false, error: s.error })
        } else {
          send('complete', {
            ok: true,
            message: { role: 'assistant', content: s.reply ?? '', ts: Date.now() },
            sources: s.sources && s.sources.length > 0 ? s.sources : undefined
          })
        }
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
  const composer = window.locator('[data-testid="chat-composer"]')
  await composer.waitFor({ state: 'visible', timeout: 8000 })
  await composer.fill(text)
  await window.getByRole('button', { name: /^Send$/ }).click()
}

const src = (
  n: number,
  title: string
): { n: number; docId: string; title: string; docType: string; snippet: string } => ({
  n,
  docId: `doc-${n}`,
  title,
  docType: 'document',
  snippet: `snippet ${n}`
})

test('ART-1 — nothing retrieved and nothing prepared renders no trace at all', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, {
    sources: [],
    reply: "I don't have Ryan's email address in your canvas or context."
  })
  await ask(window, "what's ryan's email?")

  // The answer arrives…
  await expect(window.getByText(/don't have Ryan's email address/)).toBeVisible({ timeout: 8000 })
  // …and once the request settles, no trace is left behind. Not a collapsed
  // badge, not an empty shell — nothing.
  await expect(window.locator('[data-testid="assistant-trace"]')).toHaveCount(0, { timeout: 8000 })
  await expect(window.locator('[data-testid="trace-collapsed"]')).toHaveCount(0)
})

test('ART-2 — an answer that cites nothing shows no source chips, even when retrieval returned rows', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  // The exact reported bug: six documents retrieved, an answer that used none.
  await stubStream(app, {
    sources: [1, 2, 3, 4, 5, 6].map((n) => src(n, `Retrieved doc ${n}`)),
    reply: "I don't have Ryan's email address in your canvas or context."
  })
  await ask(window, "what's ryan's email?")

  await expect(window.getByText(/don't have Ryan's email address/)).toBeVisible({ timeout: 8000 })
  // Retrieval happened, so the trace exists and names what was searched…
  await expect(window.locator('[data-testid="trace-leaf"]').first()).toBeVisible({ timeout: 8000 })
  // …but nothing was cited, so no chip row appears under the prose.
  await expect(window.locator('[data-testid="chat-sources"]')).toHaveCount(0)
})

test('ART-3 — only the cited sources become chips', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, {
    sources: [src(1, 'Release checklist'), src(2, 'updater-notes.md'), src(3, 'Decisions Ledger')],
    reply: 'The signing cert is still unsigned [2].'
  })
  await ask(window, 'where is the release blocked?')

  const chipRow = window.locator('[data-testid="chat-sources"]')
  await expect(chipRow).toBeVisible({ timeout: 8000 })
  await expect(chipRow.locator('> span')).toHaveCount(1)
  await expect(chipRow).toContainText('updater-notes.md')
  await expect(chipRow).not.toContainText('Decisions Ledger')
  await expect(chipRow).not.toContainText('Release checklist')
})

test('ART-4 — real sources and prepared tools appear in the trace, then collapse to a summary', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, {
    sources: [src(1, 'Release checklist'), src(2, 'updater-notes.md'), src(3, 'Decisions Ledger')],
    elapsedMs: 240,
    reply: 'Drafted the update and a note for the team [1].',
    tools: [
      { index: 0, kind: 'compose-mail', label: 'Email draft → Ryan' },
      { index: 1, kind: 'create-page', label: 'Page — Release update' }
    ]
  })
  await ask(window, 'draft the release update')

  const trace = window.locator('[data-testid="assistant-trace"]')
  await expect(trace).toBeVisible({ timeout: 8000 })
  // The real elapsed retrieval time is reported, not an estimate.
  await expect(trace).toContainText('Searched your workspace · 3 sources · 240ms', { timeout: 8000 })
  // Three source leaves plus two tool leaves.
  await expect(window.locator('[data-testid="trace-leaf"]')).toHaveCount(5, { timeout: 8000 })
  await expect(trace).toContainText('Prepared 2 tools')
  await expect(trace).toContainText('Email draft → Ryan')

  // Once done it holds, fades, and folds to a one-line summary that names only
  // what actually happened.
  const collapsed = window.locator('[data-testid="trace-collapsed"]')
  await expect(collapsed).toBeVisible({ timeout: 10_000 })
  await expect(collapsed).toContainText('3 sources · 2 tools')
  await expect(trace).toHaveCount(0)

  // Clicking it puts the detail back.
  await collapsed.click()
  await expect(trace).toBeVisible({ timeout: 4000 })
  await expect(trace).toContainText('Prepared 2 tools')
})

test('ART-5 — a failure ends red and never claims work it did not do', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, {
    sources: [src(1, 'Release checklist')],
    elapsedMs: 33,
    error: 'Conversation hit the model context window. Start a fresh session.'
  })
  await ask(window, 'summarise everything')

  const trace = window.locator('[data-testid="assistant-trace"]')
  await expect(trace).toBeVisible({ timeout: 8000 })
  await expect(window.locator('[data-testid="trace-error"]')).toContainText(
    'Conversation hit the model context window',
    { timeout: 8000 }
  )
  // Retrieval genuinely finished, so it stays. Nothing was written, so nothing
  // says it was — and the failed trace does not collapse itself away.
  await expect(trace).toContainText('Searched your workspace · 1 source · 33ms')
  await expect(trace).not.toContainText('Wrote the answer')
  await window.waitForTimeout(2200)
  await expect(window.locator('[data-testid="trace-collapsed"]')).toHaveCount(0)
  // The spinner is released — a failed request must not leave the composer stuck.
  await expect(window.locator('[data-testid="chat-pending"]')).toHaveCount(0)
})

test('ART-6 — clearing the thread takes its traces with it', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  await openAssistant(window)
  await stubStream(app, {
    sources: [src(1, 'Release checklist')],
    elapsedMs: 51,
    reply: 'Here is the state of the release [1].'
  })
  await ask(window, 'where is the release?')
  // Wait for the real content, not just any trace: an error trace would also be
  // "visible", and this test must not pass on one.
  await expect(window.locator('[data-testid="assistant-trace"]')).toContainText(
    'Searched your workspace · 1 source · 51ms',
    { timeout: 8000 }
  )

  await window.getByTitle('Clear chat').click()
  await expect(window.locator('[data-testid="assistant-turn"]')).toHaveCount(0, { timeout: 4000 })
  await expect(window.locator('[data-testid="assistant-trace"]')).toHaveCount(0)
  await expect(window.locator('[data-testid="trace-collapsed"]')).toHaveCount(0)
})
