#!/usr/bin/env node
// AI-driven end-user E2E for PlexiDesk's mobile PWA.
//
// A GPT-4o vision agent (via Midscene) drives the real UI the way a person
// would: it looks at the screen, finds controls, clicks, types, creates, and
// then judges in natural language whether each outcome actually happened. Every
// step is an end-user journey, not a terminal command. Midscene writes a visual
// HTML report (screenshot + the model's reasoning per step); this script also
// writes results.json with a pass/fail per journey plus the UX issues the agent
// noticed.
//
// Prereq: `node boot-local.mjs` (seeds a local signal + account + desk/doc).
// Run:    `node run.mjs`

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(HERE, '.state')
const REPO = join(HERE, '..', '..')

// ── model config (parse only the key we need out of ../../.env) ──────────────
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
// Drive the vision agent with Anthropic Claude (the funded key in ../../.env).
// Midscene routes to the Anthropic SDK when MIDSCENE_USE_ANTHROPIC_SDK=1.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || envFromFile('ANTHROPIC_API_KEY')
process.env.MIDSCENE_USE_ANTHROPIC_SDK = '1'
// claude-*-5 models reject the `temperature` param Midscene sends; use a 4.5
// vision model that accepts it.
process.env.MIDSCENE_MODEL_NAME = process.env.MIDSCENE_MODEL_NAME || 'claude-sonnet-4-5-20250929'
process.env.MIDSCENE_RUN_DIR = join(STATE, 'midscene')
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ no ANTHROPIC_API_KEY found (shell env or ../../.env)')
  process.exit(1)
}

const creds = JSON.parse(readFileSync(join(STATE, 'creds.json'), 'utf8'))
const owner = creds.accounts.find((a) => a.role === 'owner') || creds.accounts[0]
const SHOTS = join(STATE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const { PuppeteerAgent } = await import('@midscene/web/puppeteer')
const puppeteer = (await import('puppeteer')).default

const results = []
let stepNo = 0
async function step(page, name, fn) {
  stepNo += 1
  const label = `${String(stepNo).padStart(2, '0')}-${name}`
  const t0 = Date.now()
  process.stdout.write(`▶ ${label} … `)
  try {
    const detail = await fn()
    const ms = Date.now() - t0
    console.log(`PASS (${ms}ms)`)
    results.push({ step: label, status: 'PASS', ms, detail: detail ?? null })
  } catch (e) {
    const ms = Date.now() - t0
    console.log(`FAIL (${ms}ms) — ${e.message?.split('\n')[0]}`)
    results.push({ step: label, status: 'FAIL', ms, error: e.message?.split('\n').slice(0, 3).join(' | ') })
  }
  try {
    await page.screenshot({ path: join(SHOTS, `${label}.png`) })
  } catch {}
}

const main = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 414, height: 896, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto(creds.pwaUrl, { waitUntil: 'networkidle2', timeout: 45_000 })
  const agent = new PuppeteerAgent(page)

  await step(page, 'sign-in', async () => {
    await agent.aiAction(
      `Sign in. Type "${owner.email}" into the email field, type "${creds.password}" into the password field, then tap the sign in / log in button.`
    )
    await agent.aiWaitFor('the login form is gone and a signed-in workspace or home screen is visible', { timeoutMs: 20_000 })
    await agent.aiAssert('the app shows a signed-in state (a workspace, home, or navigation), not a login form')
    return 'signed in'
  })

  await step(page, 'switch-org', async () => {
    await agent.aiAction(
      `If there is an organisation or workspace switcher, open it and switch to "${creds.orgName}". If there is no such switcher, do nothing.`
    )
    return 'org switch attempted'
  })

  await step(page, 'survey-home', async () => {
    return await agent.aiQuery(
      'Return a JSON object describing what is on screen for a signed-in user: {navItems: string[], desksOrFolders: string[], documents: string[], anythingBroken: string[]}'
    )
  })

  await step(page, 'open-document', async () => {
    await agent.aiAction('Open the document titled "Team Charter". You may need to navigate to Documents or Files first.')
    await agent.aiAssert('the Team Charter document is open and its heading or body text is visible on screen')
    return 'Team Charter opened'
  })

  await step(page, 'edit-document', async () => {
    await agent.aiAction('Put the cursor at the end of the document body text and type the sentence: "Edited by the AI E2E run."')
    await agent.aiAssert('the sentence "Edited by the AI E2E run." now appears in the document body')
    return 'typed into document'
  })

  await step(page, 'open-desk', async () => {
    await agent.aiAction('Navigate to the desk or workspace called "Team Desk".')
    await agent.aiAssert('a desk or workspace view named Team Desk (or its contents) is now shown')
    return 'Team Desk opened'
  })

  await step(page, 'create-item', async () => {
    await agent.aiAction('Create a brand-new document or note. If prompted for a title, name it "AI E2E Note". Confirm/save it.')
    await agent.aiAssert('a new item or document titled "AI E2E Note" now exists or is open')
    return 'created AI E2E Note'
  })

  await step(page, 'ux-scan', async () => {
    return await agent.aiQuery(
      'You are a demanding product designer reviewing this mobile app screen as a first-time user. Return a JSON array of issues, each {issue: string, severity: "low"|"medium"|"high", where: string}. Include broken layout, overflow, unlabeled or dead-looking buttons, tiny tap targets, missing empty states, confusing navigation, or anything that would make a new user hesitate. If the screen looks clean, return an empty array.'
    )
  })

  await browser.close()

  const pass = results.filter((r) => r.status === 'PASS').length
  const summary = {
    when: new Date().toISOString(),
    target: creds.pwaUrl,
    account: owner.email,
    model: process.env.MIDSCENE_MODEL_NAME,
    passed: pass,
    failed: results.length - pass,
    steps: results
  }
  writeFileSync(join(STATE, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`\n──── ${pass}/${results.length} journeys passed ────`)
  console.log(`results:      ${join(STATE, 'results.json')}`)
  console.log(`screenshots:  ${SHOTS}`)
  console.log(`visual report: ${join(process.env.MIDSCENE_RUN_DIR, 'report')} (open the newest .html)`)
}

main().catch((e) => {
  console.error('\n✗ run failed:', e.message)
  process.exit(1)
})
