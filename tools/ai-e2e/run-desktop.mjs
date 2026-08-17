#!/usr/bin/env node
// AI-driven end-user E2E against the NATIVE Electron desktop app.
//
// It launches the built app (out/) pointed at the local signal, with Chrome
// DevTools remote debugging on, connects Puppeteer over CDP, wraps the renderer
// page with a Midscene vision agent, and drives the real desktop UI the way a
// person would: sign in, create a desk, drop a widget, type, open and edit a
// document. Same journey style as run.mjs, but on the full desktop surface the
// mobile PWA cannot reach (the canvas desk and widgets).
//
// Two things make this work in a headless-style shell:
//   1. ELECTRON_RUN_AS_NODE must be UNSET or Electron runs as plain Node with no
//      window and no CDP. We delete it from the child env.
//   2. out/ must be built for the local signal (VITE_USE_LOCAL_SIGNAL). The app's
//      main process is also pointed at it via FB_SIGNAL_URL.
//
// Prereq: `node boot-local.mjs` (signal + account) and a local build:
//   VITE_USE_LOCAL_SIGNAL=true VITE_SIGNAL_HTTP_URL=http://localhost:8795 \
//   VITE_SIGNAL_WS_URL=ws://localhost:8795/ws npm run build   (from projects/focusbuddy)
// Run:  node run-desktop.mjs

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(HERE, '.state')
const REPO = join(HERE, '..', '..') // projects/focusbuddy
const DEBUG_PORT = Number(process.env.FB_DEBUG_PORT || 9222)
const PROFILE = join(STATE, 'desktop-profile')
const SHOTS = join(STATE, 'desktop-shots')
const ELEC_LOG = join(STATE, 'desktop-electron.log')

function envFromFile(name) {
  try {
    const txt = readFileSync(join(REPO, '.env'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(new RegExp(`^${name}=(.*)$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return ''
}
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || envFromFile('ANTHROPIC_API_KEY')
process.env.MIDSCENE_USE_ANTHROPIC_SDK = '1'
process.env.MIDSCENE_MODEL_NAME = process.env.MIDSCENE_MODEL_NAME || 'claude-sonnet-4-5-20250929'
process.env.MIDSCENE_RUN_DIR = join(STATE, 'midscene-desktop')
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ no ANTHROPIC_API_KEY (shell env or ../../.env)')
  process.exit(1)
}
if (!existsSync(join(REPO, 'out', 'main', 'index.js'))) {
  console.error('✗ no out/ build. Build for the local signal first (see header).')
  process.exit(1)
}

const creds = JSON.parse(readFileSync(join(STATE, 'creds.json'), 'utf8'))
const owner = creds.accounts.find((a) => a.role === 'owner') || creds.accounts[0]
mkdirSync(SHOTS, { recursive: true })
mkdirSync(PROFILE, { recursive: true })

// ── launch the native app with a debug port ──────────────────────────────────
const electronBin = join(REPO, 'node_modules', '.bin', 'electron')
const childEnv = { ...process.env, FB_TEST_USER_DATA: PROFILE, FB_SIGNAL_URL: creds.signalHttp }
delete childEnv.ELECTRON_RUN_AS_NODE // critical: otherwise electron runs as node, no window, no CDP
const out = openSync(ELEC_LOG, 'a')
console.log(`• launching native app (debug port ${DEBUG_PORT}, profile ${PROFILE}) …`)
const elec = spawn(electronBin, ['.', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: REPO,
  env: childEnv,
  detached: true,
  stdio: ['ignore', out, out]
})
elec.unref()

async function cdpJson(path) {
  try {
    const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}${path}`)
    return await r.json()
  } catch {
    return null
  }
}

const puppeteer = (await import('puppeteer')).default
const { PuppeteerAgent } = await import('@midscene/web/puppeteer')

// Optional filter: FB_STEPS=create-slides,chat-message runs only those journeys
// (useful for re-verifying a subset against a signed-in profile).
const ONLY = (process.env.FB_STEPS || '').split(',').map((s) => s.trim()).filter(Boolean)
const results = []
let stepNo = 0
async function step(page, name, fn) {
  stepNo += 1
  const label = `${String(stepNo).padStart(2, '0')}-${name}`
  if (ONLY.length && !ONLY.includes(name)) {
    results.push({ step: label, status: 'SKIP' })
    return
  }
  const t0 = Date.now()
  process.stdout.write(`▶ ${label} … `)
  try {
    const detail = await fn()
    console.log(`PASS (${Date.now() - t0}ms)`)
    results.push({ step: label, status: 'PASS', ms: Date.now() - t0, detail: detail ?? null })
  } catch (e) {
    console.log(`FAIL (${Date.now() - t0}ms) — ${e.message?.split('\n')[0]}`)
    results.push({ step: label, status: 'FAIL', ms: Date.now() - t0, error: e.message?.split('\n').slice(0, 3).join(' | ') })
  }
  try {
    await page.screenshot({ path: join(SHOTS, `${label}.png`) })
  } catch {}
}

async function main() {
  // wait for the debug endpoint
  let version = null
  for (let i = 0; i < 40; i++) {
    version = await cdpJson('/json/version')
    if (version) break
    await sleep(500)
  }
  if (!version) throw new Error('Electron debug port never came up — see ' + ELEC_LOG)
  console.log(`• CDP up: ${version.Browser}`)

  // Bump protocolTimeout well above the default 180s: some office surfaces take
  // a while to mount, and a single CDP input event must not time the run out.
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: null,
    protocolTimeout: 300_000
  })

  // find the app renderer page (fb-file/fb-dev scheme, or the first real page)
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    const pages = await browser.pages()
    page =
      pages.find((p) => /^fb-(file|dev)/.test(p.url())) ||
      pages.find((p) => !/^(about:blank|devtools:)/.test(p.url()) && p.url() !== '') ||
      null
    if (!page) await sleep(500)
  }
  if (!page) throw new Error('could not find the app renderer page over CDP')
  await page.bringToFront().catch(() => {})
  console.log(`• driving page: ${page.url().slice(0, 60)}`)

  const agent = new PuppeteerAgent(page)

  await step(page, 'sign-in', async () => {
    await agent.aiWaitFor('the app has finished loading and shows either a sign-in form or a workspace', { timeoutMs: 40_000 })
    await agent.aiAction(
      `If a sign-in form is shown, type "${owner.email}" into the email field, type "${creds.password}" into the password field, and click the sign in / log in button. If already signed in, do nothing.`
    )
    await agent.aiWaitFor('a signed-in workspace, home, or desk view is visible (no sign-in form)', { timeoutMs: 30_000 })
    await agent.aiAssert('the app shows a signed-in state, not a sign-in form')
    return 'signed in'
  })

  await step(page, 'switch-org', async () => {
    await agent.aiAction(`If there is an organisation or workspace switcher, open it and switch to "${creds.orgName}". Otherwise do nothing.`)
    return 'org switch attempted'
  })

  await step(page, 'survey-home', async () =>
    agent.aiQuery('Return JSON {navSegments: string[], sidebarItems: string[], desksOrRooms: string[], anythingBroken: string[]} describing the desktop workspace on screen.')
  )

  await step(page, 'create-desk', async () => {
    await agent.aiAction('Create a brand-new desk (or room). If asked for a name, name it "AI Native Desk". Confirm and open it.')
    await agent.aiAssert('a desk or room named "AI Native Desk" now exists or is open')
    return 'created AI Native Desk'
  })

  // Hardened: the note body is a separate text area from the widget title. Click
  // into the body first, type, then click empty canvas so the debounced save fires.
  await step(page, 'add-note-widget', async () => {
    await agent.aiAction('On the open desk canvas, add a note or sticky-note widget. Widgets come from the sidebar or a + / add menu.')
    await agent.aiAction('Click directly inside the note widget\'s main text area (the body that shows "Write a note…", not the title), so the cursor is in it.')
    await agent.aiAction('Type this exact text into that note body: Hello from the AI native E2E run.')
    await agent.aiAction('Click on an empty part of the desk canvas to deselect the note so it saves.')
    await agent.aiAssert('a note or sticky widget on the desk visibly shows the text "Hello from the AI native E2E run." (not just a placeholder)')
    return 'note widget body typed + saved'
  })

  await step(page, 'add-second-widget', async () => {
    await agent.aiAction('Add a second widget to the same desk, a task list or a timer, from the sidebar or the + / add menu.')
    await agent.aiAssert('there are now at least two widgets on the desk canvas')
    return 'second widget added'
  })

  await step(page, 'wire-widgets', async () => {
    await agent.aiAction('Connect the two widgets together. Hover a widget to reveal a link/connection handle and drag it onto the other widget, or use a right-click "connect" / "link" option.')
    await agent.aiAssert('a connection line or wire now visibly links the two widgets on the canvas')
    return 'widgets wired'
  })

  await step(page, 'create-sheet', async () => {
    await agent.aiAction('Create a new spreadsheet (PlexiSheets), from the office area or a create / + menu.')
    await agent.aiAction('Click the first cell and type 42, then press Enter.')
    await agent.aiAssert('a spreadsheet grid is open and a cell contains 42')
    return 'spreadsheet created + cell typed'
  })

  await step(page, 'create-slides', async () => {
    await agent.aiAction('Create a new presentation (PlexiSlides), from the office area or a create / + menu.')
    await agent.aiAction('Set the title of the first slide to: AI E2E Deck')
    await agent.aiAssert('a slide editor is open and the first slide shows the title "AI E2E Deck"')
    return 'presentation created + title set'
  })

  await step(page, 'chat-message', async () => {
    await agent.aiAction('Open the Chat / PlexiChat area (it may be under a People, Chat, or Messages section in the navigation).')
    await agent.aiAction('In the channel or conversation list, select the channel named "general" (it may show as #general).')
    await agent.aiAction('Click the message input box at the bottom of the conversation, type "Hello from the AI native E2E run", and press Enter to send it.')
    await agent.aiWaitFor('the sent message text is visible in the conversation message list', { timeoutMs: 20_000 })
    await agent.aiAssert('the message "Hello from the AI native E2E run" appears in the general channel message list')
    return 'chat message sent'
  })

  await step(page, 'ux-scan', async () =>
    agent.aiQuery(
      'You are a demanding product designer reviewing this desktop app screen as a first-time user. Return a JSON array of {issue, severity: "low"|"medium"|"high", where}. Include broken layout, overflow, unlabeled or dead controls, confusing navigation, or anything that would make a new user hesitate. Empty array if clean.'
    )
  )

  await browser.disconnect()
  try {
    process.kill(-elec.pid)
  } catch {
    try {
      process.kill(elec.pid)
    } catch {}
  }

  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const ran = pass + fail
  const summary = {
    when: new Date().toISOString(),
    surface: 'native-desktop (Electron over CDP)',
    signal: creds.signalHttp,
    account: owner.email,
    model: process.env.MIDSCENE_MODEL_NAME,
    passed: pass,
    failed: fail,
    skipped: results.filter((r) => r.status === 'SKIP').length,
    steps: results
  }
  const OUT = ONLY.length ? 'results-desktop-subset.json' : 'results-desktop.json'
  writeFileSync(join(STATE, OUT), JSON.stringify(summary, null, 2))
  console.log(`\n──── native desktop: ${pass}/${ran} journeys passed ────`)
  console.log(`results:       ${join(STATE, OUT)}`)
  console.log(`screenshots:   ${SHOTS}`)
  console.log(`visual report: ${join(process.env.MIDSCENE_RUN_DIR, 'report')} (newest .html)`)
}

main().catch(async (e) => {
  console.error('\n✗ desktop run failed:', e.message)
  try {
    process.kill(-elec.pid)
  } catch {
    try {
      process.kill(elec.pid)
    } catch {}
  }
  process.exit(1)
})
