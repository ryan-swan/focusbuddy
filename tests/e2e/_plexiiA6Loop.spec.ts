import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// A6/B2 loop probe: the agentic-browsing loop on the REAL path — SDK against
// the fake Claude's sequenced non-stream lane, the round loop in main, the
// R26 consent pause answered over real IPC, the bridge acting on a real page
// in the panel's webview, events accumulating in the renderer store. Three
// scripted runs: (1) consent pause → grant-and-remember → click → done, the
// page genuinely mutated and the grant recorded; (2) a banned click refused
// by the bridge and reported, ending need_input; (3) a stop landing mid-run.
// Throwaway; delete when A6 closes.

const FAKE_SITE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Loop Probe</title></head><body>
  <h1>Loop probe site</h1>
  <div id="count">count: 0</div>
  <button id="counter" onclick="this.previousElementSibling.textContent='count: '+(++window.__n)">Click me</button>
  <script>window.__n=0</script>
  <form id="login">
    <input name="user" placeholder="Username">
    <input type="password" name="pw" placeholder="Password">
    <button type="submit">Sign in</button>
  </form>
</body></html>`

// Element indices in DOM order: [0] Click me, [1] Username, [2] Password,
// [3] Sign in. The site is ours, so the canned envelopes can be exact.
const TURNS = [
  // Run 1
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
  // Run 2
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
  // Run 3
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

interface RunState {
  runId: string
  outcome: string
  summary: string
  pendingConsentHost: string | null
  events: Array<{ kind: string; [k: string]: unknown }>
  cost: { inputTokens: number; outputTokens: number; costMicros: number } | null
}

declare global {
  interface Window {
    __fbBrowserAgent: {
      getState(): {
        runs: Record<string, RunState>
        start(input: { task: string; startUrl?: string }): Promise<string | null>
        stop(runId: string): Promise<void>
        consent(runId: string, granted: boolean, remember: boolean): Promise<void>
      }
    }
  }
}

test('the loop: consent, act, refuse, stop — all on the real path', async () => {
  test.setTimeout(180000)
  const fake = await startFakeClaude({ text: '{"reply":"unused","actions":[]}', shortTexts: TURNS })
  const launched = await launchApp({
    env: { ANTHROPIC_API_KEY: 'sk-ant-fake-e2e', ANTHROPIC_BASE_URL: fake.url }
  })
  const { window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })

  // Open the fake site in the panel; the run drives its webview.
  await window.evaluate((u) => window.__fbWebPanel.getState().openWeb(u), base)
  await window.waitForFunction(() => window.__fbWebPanel.getState().wcId != null)
  await window.waitForTimeout(1000)

  const runState = (runId: string) =>
    window.evaluate((id) => window.__fbBrowserAgent.getState().runs[id], runId)

  // ── Run 1: consent pauses, grant-and-remember resumes, the click lands ──
  const run1 = (await window.evaluate(() =>
    window.__fbBrowserAgent.getState().start({ task: 'Click the counter button once.' })
  )) as string
  expect(run1).toBeTruthy()

  await window.waitForFunction(
    (id) => window.__fbBrowserAgent.getState().runs[id]?.pendingConsentHost != null,
    run1
  )
  const s1 = await runState(run1)
  expect(s1.pendingConsentHost).toBe('127.0.0.1')
  // The loop is genuinely paused: no acted event yet.
  expect(s1.events.some((e) => e.kind === 'acted')).toBe(false)

  await window.evaluate((id) => window.__fbBrowserAgent.getState().consent(id, true, true), run1)
  await window.waitForFunction(
    (id) => window.__fbBrowserAgent.getState().runs[id]?.outcome !== 'running',
    run1
  )
  const done1 = await runState(run1)
  expect(done1.outcome).toBe('done')
  expect(done1.summary).toContain('count is now 1')
  const acted1 = done1.events.filter((e) => e.kind === 'acted')
  expect(acted1).toHaveLength(1)
  expect(acted1[0]).toMatchObject({ ok: true })
  expect((acted1[0].action as { kind: string }).kind).toBe('click')
  // Real cost accounting from the API's usage field, not a guess.
  expect(done1.cost!.inputTokens).toBeGreaterThan(0)
  expect(done1.cost!.costMicros).toBeGreaterThan(0)

  // The page genuinely mutated — read it back through the bridge.
  const wcId = await window.evaluate(() => window.__fbWebPanel.getState().wcId as number)
  const reader = await window.evaluate((id) => window.api.agentBrowser.createRun(id), wcId)
  const pageText = await window.evaluate(
    ([rid]) => window.api.agentBrowser.perform(rid as string, { kind: 'read_page' } as never),
    [reader.id] as const
  )
  expect(pageText.text).toContain('count: 1')
  await window.evaluate(([rid]) => window.api.agentBrowser.endRun(rid as string), [reader.id] as const)

  // The remembered grant is on the reviewable list (R26).
  const grants = await window.evaluate(() => window.api.browserAgent.listConsent())
  expect(grants.map((g) => g.host)).toContain('127.0.0.1')

  // ── Run 2: the bridge refuses the credential submit; the loop reports ──
  const run2 = (await window.evaluate(() =>
    window.__fbBrowserAgent.getState().start({ task: 'Sign in to the site.' })
  )) as string
  await window.waitForFunction(
    (id) => window.__fbBrowserAgent.getState().runs[id]?.outcome !== 'running',
    run2
  )
  const done2 = await runState(run2)
  expect(done2.outcome).toBe('need_input')
  const acted2 = done2.events.filter((e) => e.kind === 'acted')
  expect(acted2).toHaveLength(1)
  expect(acted2[0]).toMatchObject({ ok: false, refused: 'credential_submit' })
  expect(done2.events.some((e) => e.kind === 'needs_human')).toBe(true)
  // No consent pause this time — the grant stood.
  expect(done2.events.some((e) => e.kind === 'consent_required')).toBe(false)

  // ── Run 3: Stop lands mid-run ──────────────────────────────────────────
  const run3 = (await window.evaluate(() =>
    window.__fbBrowserAgent.getState().start({ task: 'Wait around.' })
  )) as string
  // Let it reach the wait action, then stop.
  await window.waitForFunction(
    (id) => window.__fbBrowserAgent.getState().runs[id]?.events.some((e) => e.kind === 'round'),
    run3
  )
  await window.waitForTimeout(600)
  await window.evaluate((id) => window.__fbBrowserAgent.getState().stop(id), run3)
  await window.waitForFunction(
    (id) => window.__fbBrowserAgent.getState().runs[id]?.outcome !== 'running',
    run3
  )
  const done3 = await runState(run3)
  expect(done3.outcome).toBe('stopped')

  await fake.close()
  await launched.dispose()
})
