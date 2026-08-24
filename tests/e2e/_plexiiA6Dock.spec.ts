import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// A6/B3a — the visible run, judged in the built app: the panel's ask door
// starts a run, the consent question renders in the dock and resumes the
// loop, steps land in the ledger (refusals in honest words), the cost
// ticker shows real numbers, Stop ends a live run, dismiss clears the
// dock. SHOT_THEME=light flips the theme. Throwaway; delete when A6 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const FAKE_SITE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Dock Probe</title></head><body style="font:14px sans-serif;padding:24px">
  <h1>Dock probe site</h1>
  <div id="count">count: 0</div>
  <button id="counter" onclick="this.previousElementSibling.textContent='count: '+(++window.__n)">Click me</button>
  <script>window.__n=0</script>
  <form id="login">
    <input name="user" placeholder="Username">
    <input type="password" name="pw" placeholder="Password">
    <button type="submit">Sign in</button>
  </form>
</body></html>`

const TURNS = [
  // Run 1: click the counter, then done.
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
  }),
  // Run 2: a banned submit, then need_input.
  JSON.stringify({
    narration: 'Trying to submit the sign-in form.',
    status: 'working',
    blocker: null,
    action: { kind: 'click', elementIndex: 3 }
  }),
  JSON.stringify({
    narration: 'That needs your sign-in.',
    status: 'need_input',
    blocker: 'The sign-in is yours to do.',
    action: null
  }),
  // Run 3: a long wait for the Stop leg.
  JSON.stringify({
    narration: 'Waiting for the page.',
    status: 'working',
    blocker: null,
    action: { kind: 'wait', ms: 4500 }
  })
]

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

async function openSteps(window: import('@playwright/test').Page): Promise<void> {
  // stepsOpen is component state and survives across runs — open only if closed.
  if (!(await window.locator('[data-testid="agent-run-steps"]').isVisible())) {
    await window.locator('[data-testid="agent-run-steps-toggle"]').click()
  }
}

test('the visible run: ask door, consent, ledger, cost, stop, dismiss', async () => {
  test.setTimeout(180000)
  const fake = await startFakeClaude({ text: '{"reply":"unused","actions":[]}', shortTexts: TURNS })
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

  await window.evaluate((u) => window.__fbWebPanel.getState().openWeb(u), base)
  await expect(window.locator('[data-testid="web-panel"]')).toBeVisible()
  await window.waitForFunction(() => window.__fbWebPanel.getState().wcId != null)
  await window.waitForTimeout(800)

  // ── The ask door on the panel toolbar ──────────────────────────────────
  await window.locator('[data-testid="web-panel-agent"]').click()
  const ask = window.locator('[data-testid="agent-ask-input"]')
  await expect(ask).toBeVisible()
  await window.screenshot({ path: `${OUT}/a6-dock-1-ask.png` })
  await ask.fill('Click the counter button once.')
  await ask.press('Enter')

  // ── Consent renders in the dock and the loop is genuinely paused ───────
  const dock = window.locator('[data-testid="agent-run-dock"]')
  await expect(window.locator('[data-testid="agent-consent-always"]')).toBeVisible({
    timeout: 20000
  })
  await expect(dock).toContainText('Let Plexii act on 127.0.0.1?')
  await window.screenshot({ path: `${OUT}/a6-dock-2-consent.png` })
  await window.locator('[data-testid="agent-consent-always"]').click()

  // ── The run finishes; the ledger tells the story; the cost is real ─────
  await expect(dock).toHaveAttribute('data-outcome', 'done', { timeout: 30000 })
  await expect(window.locator('[data-testid="agent-run-line"]')).toContainText('count is now 1')
  await expect(window.locator('[data-testid="agent-run-cost"]')).toHaveText(/\$/)
  await openSteps(window)
  await expect(window.locator('[data-testid="agent-run-steps"]')).toContainText('Clicked')
  await window.screenshot({ path: `${OUT}/a6-dock-3-done.png` })

  // ── Dismiss clears it ──────────────────────────────────────────────────
  await window.locator('[data-testid="agent-run-dismiss"]').click()
  await expect(dock).toHaveCount(0)

  // ── Run 2: the refusal reads in honest words, outcome need_input ───────
  await window.locator('[data-testid="web-panel-agent"]').click()
  await ask.fill('Sign in to the site.')
  await ask.press('Enter')
  await expect(dock).toHaveAttribute('data-outcome', 'need_input', { timeout: 30000 })
  await expect(window.locator('[data-testid="agent-run-line"]')).toContainText('sign-in is yours')
  await openSteps(window)
  await expect(window.locator('[data-testid="agent-run-steps"]')).toContainText('Held back')
  await window.screenshot({ path: `${OUT}/a6-dock-4-needs-you.png` })
  await window.locator('[data-testid="agent-run-dismiss"]').click()

  // ── Run 3: Stop ends a live run from the dock ──────────────────────────
  await window.locator('[data-testid="web-panel-agent"]').click()
  await ask.fill('Wait around.')
  await ask.press('Enter')
  const stopBtn = window.locator('[data-testid="agent-run-stop"]')
  await expect(stopBtn).toBeVisible({ timeout: 20000 })
  await window.screenshot({ path: `${OUT}/a6-dock-5-running.png` })
  await stopBtn.click()
  await expect(dock).toHaveAttribute('data-outcome', 'stopped', { timeout: 15000 })

  await fake.close()
  await launched.dispose()
})
