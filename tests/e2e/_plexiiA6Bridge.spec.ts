import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { launchApp, waitForReady } from './_helpers'

// A6/B1 fake-site probe: the deterministic action bridge proven in the BUILT
// app against a page we control — no model, no network, no key. What it must
// prove: the snapshot sees the page truly; allowed actions really act
// (trusted input events, not synthetic dispatch); every R29 ban refuses on
// BOTH paths (indexed and coordinates); the kill switch beats every action;
// no window ever opens outside the panel. Throwaway; delete when A6 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'

const FAKE_SITE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Bridge Probe</title>
<style>body{font:14px sans-serif;padding:24px}form{margin:16px 0;padding:8px;border:1px solid #ccc}</style>
</head><body>
  <h1>Bridge probe site</h1>
  <div id="count">count: 0</div>
  <button id="counter" onclick="this.previousElementSibling.textContent='count: '+(++window.__n)">Click me</button>
  <script>window.__n=0</script>

  <input id="name" placeholder="Your name" oninput="document.getElementById('mirror').textContent=this.value">
  <div id="mirror"></div>

  <select id="color" aria-label="Colour" onchange="document.getElementById('picked').textContent=this.value">
    <option value="red">red</option><option value="green">green</option><option value="blue">blue</option>
  </select>
  <div id="picked"></div>

  <form id="login">
    <input name="user" placeholder="Username">
    <input type="password" name="pw" placeholder="Password">
    <button type="submit">Sign in</button>
  </form>

  <form id="pay">
    <input autocomplete="cc-number" placeholder="Card number">
    <button type="submit">Pay now</button>
  </form>

  <input type="file" aria-label="Upload a file">
  <a href="/other" target="_blank">Open other page</a>
</body></html>`

let server: Server
let base = ''

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/other') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><title>Other</title><h1 id="other">The other page</h1>')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(FAKE_SITE)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

interface BridgeApi {
  createRun(wcId: number): Promise<{ id: string }>
  stopRun(runId: string): Promise<boolean>
  endRun(runId: string): Promise<void>
  perform(
    runId: string,
    action: Record<string, unknown> & { kind: string }
  ): Promise<{
    ok: boolean
    refused?: string
    text?: string
    pageUrl?: string
    captchaPresent?: boolean
    elements?: Array<{
      idx: number
      label: string
      tag: string
      type: string
      bounds: { x: number; y: number; w: number; h: number }
    }>
    image?: { base64Png: string; width: number; height: number }
  }>
}

declare global {
  interface Window {
    api: { agentBrowser: BridgeApi }
    __fbWebPanel: {
      getState(): {
        wcId: number | null
        openWeb(url: string): void
        close(): void
        setActiveRun(runId: string | null): void
      }
    }
  }
}

test('the action bridge: snapshot, act, refuse, fall back, stop', async () => {
  test.setTimeout(180000)
  const launched = await launchApp()
  const { app, window } = launched
  await waitForReady(window)
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.evaluate(
    (t) => localStorage.setItem('fb.theme.mode', t),
    process.env.SHOT_THEME ?? 'dark'
  )
  await window.reload()
  await waitForReady(window)

  // Open the fake site in the panel and wait for the webview to attach.
  await window.evaluate((u) => window.__fbWebPanel.getState().openWeb(u), base)
  await expect(window.locator('[data-testid="web-panel"]')).toBeVisible()
  await window.waitForFunction(() => window.__fbWebPanel.getState().wcId != null)
  const wcId = await window.evaluate(() => window.__fbWebPanel.getState().wcId as number)
  await window.waitForTimeout(1200) // let the fake site finish loading

  const run = await window.evaluate((id) => window.api.agentBrowser.createRun(id), wcId)
  const perform = (action: Record<string, unknown> & { kind: string }) =>
    window.evaluate(
      ([rid, a]) => window.api.agentBrowser.perform(rid as string, a as never),
      [run.id, action] as const
    )

  // ── The snapshot sees the page truly ──────────────────────────────────
  const snap = await perform({ kind: 'snapshot' })
  expect(snap.ok).toBe(true)
  expect(snap.captchaPresent).toBe(false)
  const els = snap.elements!
  const byLabel = (label: string) => els.find((e) => e.label.includes(label))
  const counter = byLabel('Click me')!
  const name = byLabel('Your name')!
  const colour = byLabel('Colour')!
  const password = byLabel('Password')!
  const signIn = byLabel('Sign in')!
  const card = byLabel('Card number')!
  const payNow = byLabel('Pay now')!
  const file = byLabel('Upload a file')!
  const link = byLabel('Open other page')!
  for (const el of [counter, name, colour, password, signIn, card, payNow, file, link]) {
    expect(el).toBeTruthy()
  }

  // ── Allowed actions really act (trusted events land on the page) ──────
  expect((await perform({ kind: 'click', elementIndex: counter.idx })).ok).toBe(true)
  let text = (await perform({ kind: 'read_page' })).text!
  expect(text).toContain('count: 1')

  expect(
    (await perform({ kind: 'type', elementIndex: name.idx, text: 'Plexii was here' })).ok
  ).toBe(true)
  text = (await perform({ kind: 'read_page' })).text!
  expect(text).toContain('Plexii was here')

  expect((await perform({ kind: 'select', elementIndex: colour.idx, value: 'green' })).ok).toBe(true)
  text = (await perform({ kind: 'read_page' })).text!
  expect(text).toContain('green')

  // ── The R29 bans, indexed path ────────────────────────────────────────
  expect((await perform({ kind: 'type', elementIndex: password.idx, text: 'x' })).refused).toBe(
    'credential_field'
  )
  expect((await perform({ kind: 'click', elementIndex: signIn.idx })).refused).toBe(
    'credential_submit'
  )
  expect((await perform({ kind: 'type', elementIndex: card.idx, text: '4242' })).refused).toBe(
    'payment_field'
  )
  expect((await perform({ kind: 'click', elementIndex: payNow.idx })).refused).toBe('payment_submit')
  expect((await perform({ kind: 'click', elementIndex: file.idx })).refused).toBe('file_transfer')

  // ── The bans hold on the COORDINATE path (the fallback hit-tests) ─────
  // Fresh bounds first: the indexed acts above scrolled the page, and the
  // fallback contract is "coordinates from what you are looking at NOW".
  const snap2 = await perform({ kind: 'snapshot' })
  const payNow2 = snap2.elements!.find((e) => e.label.includes('Pay now'))!
  const payCentre = {
    x: Math.round(payNow2.bounds.x + payNow2.bounds.w / 2),
    y: Math.round(payNow2.bounds.y + payNow2.bounds.h / 2)
  }
  expect((await perform({ kind: 'click_at', ...payCentre })).refused).toBe('payment_submit')

  // Enter on a focused login form is a submit — same rule, keyboard path.
  expect((await perform({ kind: 'click', elementIndex: password.idx })).ok).toBe(true) // focusing is fine
  expect((await perform({ kind: 'press_key', key: 'Enter' })).refused).toBe('credential_submit')
  expect((await perform({ kind: 'type_text', text: 'hunter2' })).refused).toBe('credential_field')

  // ── The screenshot leg of the hybrid (R27) ────────────────────────────
  const shot = await perform({ kind: 'screenshot' })
  expect(shot.ok).toBe(true)
  expect(shot.image!.width).toBeGreaterThan(100)
  expect(shot.image!.height).toBeGreaterThan(100)
  expect(shot.image!.base64Png.length).toBeGreaterThan(1000)

  // ── No window ever opens outside the panel (R29) ──────────────────────
  expect((await perform({ kind: 'click', elementIndex: link.idx })).ok).toBe(true)
  await window.waitForTimeout(800)
  const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(windowCount).toBe(1)

  // ── The kill switch beats everything ──────────────────────────────────
  await window.evaluate(([rid]) => window.api.agentBrowser.stopRun(rid as string), [run.id] as const)
  expect((await perform({ kind: 'read_page' })).refused).toBe('run_stopped')
  expect((await perform({ kind: 'click', elementIndex: counter.idx })).refused).toBe('run_stopped')
  await window.evaluate(([rid]) => window.api.agentBrowser.endRun(rid as string), [run.id] as const)

  await window.screenshot({ path: `${OUT}/a6-bridge-1-fake-site.png` })

  // ── Closing the panel is itself a kill switch: no page, no run ────────
  const run2 = await window.evaluate((id) => window.api.agentBrowser.createRun(id), wcId)
  await window.evaluate(
    ([rid]) => window.__fbWebPanel.getState().setActiveRun(rid as string),
    [run2.id] as const
  )
  await window.evaluate(() => window.__fbWebPanel.getState().close())
  const afterClose = await window.evaluate(
    ([rid]) => window.api.agentBrowser.perform(rid as string, { kind: 'read_page' } as never),
    [run2.id] as const
  )
  expect(afterClose.refused).toBe('run_stopped')
  await window.evaluate(([rid]) => window.api.agentBrowser.endRun(rid as string), [run2.id] as const)

  await launched.dispose()
})
