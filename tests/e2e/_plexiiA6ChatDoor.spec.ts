import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// A6/B3b — the chat door, end to end on the real path: a real composer turn
// streams an envelope carrying an agent-browse action; the card renders (R5:
// it ACTS); clicking it opens the in-app browser at the proposed page and
// starts a supervised run; consent renders in the dock; the run clicks the
// real page and finishes. One conversation → the whole A6 arc.
// SHOT_THEME=light flips the theme. Throwaway; delete when A6 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const FAKE_SITE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Chat Door Probe</title></head><body style="font:14px sans-serif;padding:24px">
  <h1>Chat door probe site</h1>
  <div id="count">count: 0</div>
  <button id="counter" onclick="this.previousElementSibling.textContent='count: '+(++window.__n)">Click me</button>
  <script>window.__n=0</script>
</body></html>`

let server: Server
let base = ''

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(FAKE_SITE)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

test('chat offers a browsing run; the card starts it; the run acts and finishes', async () => {
  test.setTimeout(180000)
  const chatEnvelope = JSON.stringify({
    reply: 'I can click that for you — here is the run.',
    actions: [
      {
        kind: 'agent-browse',
        task: 'Click the counter button once.',
        url: base,
        reason: 'The counter needs a real click on the page.'
      }
    ]
  })
  const fake = await startFakeClaude({
    text: chatEnvelope,
    charsPerDelta: 24,
    deltaMs: 5,
    // The loop's rounds; gated on the browser-agent system prompt so chat
    // titles or extraction can never eat a scripted turn.
    shortTextsMatch: 'driving the in-app browser',
    shortTexts: [
      JSON.stringify({
        narration: 'Clicking the counter button.',
        status: 'working',
        blocker: null,
        action: { kind: 'click', elementIndex: 0 }
      }),
      JSON.stringify({
        narration: 'Done — the count is now 1.',
        status: 'done',
        blocker: null,
        action: null
      })
    ]
  })
  const launched = await launchApp({
    env: { ANTHROPIC_API_KEY: 'sk-ant-fake-e2e', ANTHROPIC_BASE_URL: fake.url }
  })
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(
    (t) => localStorage.setItem('fb.theme.mode', t),
    process.env.SHOT_THEME ?? 'dark'
  )
  await window.reload()
  await waitForReady(window)

  // A real composer turn in the assistant.
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goPlexii: () => void } } }
    w.__fbView?.getState().goPlexii()
  })
  await window.waitForTimeout(400)
  const composer = window.locator('[data-testid="chat-composer"]')
  await composer.click()
  await window.keyboard.type('Could you click the counter button on the probe site for me?', { delay: 3 })
  await window.keyboard.press('Enter')

  // The reply streams; the agent-browse card renders and reads honestly.
  await expect(window.getByText(/I can click that for you/).first()).toBeVisible({
    timeout: 20000
  })
  const card = window.locator('[data-testid^="proposal-card-browse"]').first()
  await expect(card).toBeVisible({ timeout: 10000 })
  await expect(card).toContainText('Let Plexii browse')
  await expect(card).toContainText('Click the counter button once.')
  await window.screenshot({ path: `${OUT}/a6-chatdoor-1-card.png` })

  // The card ACTS: panel opens at the proposed page, the run starts, and
  // the R26 consent question lands in the dock.
  await card.click()
  await expect(window.locator('[data-testid="web-panel"]')).toBeVisible({ timeout: 15000 })
  await expect(window.locator('[data-testid="agent-consent-always"]')).toBeVisible({
    timeout: 20000
  })
  await window.screenshot({ path: `${OUT}/a6-chatdoor-2-consent.png` })
  await window.locator('[data-testid="agent-consent-always"]').click()

  // The run finishes; the page was genuinely clicked.
  const dock = window.locator('[data-testid="agent-run-dock"]')
  await expect(dock).toHaveAttribute('data-outcome', 'done', { timeout: 30000 })
  await expect(window.locator('[data-testid="agent-run-line"]')).toContainText('count is now 1')
  const wcId = await window.evaluate(
    () =>
      (window as unknown as { __fbWebPanel: { getState(): { wcId: number | null } } }).__fbWebPanel.getState()
        .wcId as number
  )
  const reader = await window.evaluate(
    (id) =>
      (window as unknown as { api: { agentBrowser: { createRun: (id: number) => Promise<{ id: string }> } } }).api.agentBrowser.createRun(
        id
      ),
    wcId
  )
  const text = await window.evaluate(
    ([rid]) =>
      (
        window as unknown as {
          api: { agentBrowser: { perform: (r: string, a: { kind: string }) => Promise<{ text?: string }> } }
        }
      ).api.agentBrowser.perform(rid as string, { kind: 'read_page' }),
    [reader.id] as const
  )
  expect(text.text).toContain('count: 1')
  await window.screenshot({ path: `${OUT}/a6-chatdoor-3-done.png` })

  await fake.close()
  await launched.dispose()
})
