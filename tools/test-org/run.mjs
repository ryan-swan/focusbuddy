#!/usr/bin/env node
// PlexiDesk 4.0 — 10-user org test harness.
//
// Spins up an ISOLATED local signal server, creates one organisation with ten
// real member accounts, seeds a shared room + desk + document, builds the app
// pointed at the local signal, and launches real Electron windows (one isolated
// userData each) so you can drive genuine multi-user flows: chat, meetings,
// on-desk meets, live desk/office/widget collaboration, widget sharing across
// desks, multi-user desks, and 2-player AI.
//
// Everything lives under tools/test-org/.state and touches NONE of your real or
// production data. `node run.mjs stop` tears it all down.
//
// Commands:
//   node run.mjs setup            boot signal, make org+10 users, seed, build, print creds
//   node run.mjs open [count]     launch the first N windows (default 3)
//   node run.mjs launch <n|email> launch one window (1..10 or an email)
//   node run.mjs creds            print the 10 accounts + org + signal URL
//   node run.mjs status           what's running
//   node run.mjs stop             kill the signal server + all launched windows
//
// 2-player AI: export ANTHROPIC_API_KEY before `setup` and it is passed to the
// local signal's credit proxy so every account's AI works with no per-window key
// paste. The key is never printed, logged, or stored by this script.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..') // projects/focusbuddy
const SIGNAL = resolve(REPO, '../focusbuddy-signal')
const STATE_DIR = join(HERE, '.state')
const STATE_FILE = join(STATE_DIR, 'state.json')
const USERDATA_BASE = join(STATE_DIR, 'userdata')
const SIGNAL_DATA = join(STATE_DIR, 'signal-data')
const SIGNAL_LOG = join(STATE_DIR, 'signal.log')

const PORT = Number(process.env.TEST_ORG_PORT || 8795)
const HTTP = `http://localhost:${PORT}`
const WS = `ws://localhost:${PORT}/ws`
const ORG_NAME = process.env.TEST_ORG_NAME || 'Plexi Test Org'
const PASSWORD = process.env.TEST_ORG_PASSWORD || 'TestPlexi!2026'

// Ten friendly members so the org feels like a real team, not user1..user10.
const PEOPLE = [
  { first: 'Ava', last: 'Stone' },
  { first: 'Ben', last: 'Ortiz' },
  { first: 'Chloe', last: 'Park' },
  { first: 'Dan', last: 'Reed' },
  { first: 'Eve', last: 'Chen' },
  { first: 'Finn', last: 'Walsh' },
  { first: 'Gia', last: 'Rossi' },
  { first: 'Hugo', last: 'Blum' },
  { first: 'Isla', last: 'Kaur' },
  { first: 'Jae', last: 'Kim' }
]
const emailFor = (p) => `${p.first.toLowerCase()}@testorg.local`

// ── small utilities ──────────────────────────────────────────────────────────
function log(msg) {
  console.log(msg)
}
function die(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}
function ensureDirs() {
  for (const d of [STATE_DIR, USERDATA_BASE, SIGNAL_DATA]) mkdirSync(d, { recursive: true })
}
function readState() {
  if (!existsSync(STATE_FILE)) return null
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return null
  }
}
function writeState(s) {
  ensureDirs()
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}
function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
async function httpJson(path, { method = 'GET', token, org, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (org) headers['x-plexi-org'] = org
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${HTTP}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

// ── signal server ────────────────────────────────────────────────────────────
async function waitHealthz(timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${HTTP}/healthz`)
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await sleep(400)
  }
  return false
}

async function startSignal(state) {
  if (state?.signalPid && pidAlive(state.signalPid) && (await waitHealthz(1500))) {
    log(`• Signal already running (pid ${state.signalPid}) at ${HTTP}`)
    return state.signalPid
  }
  ensureDirs()
  const tsx = join(SIGNAL, 'node_modules', '.bin', 'tsx')
  if (!existsSync(tsx)) die(`signal tsx not found at ${tsx} — run npm install in focusbuddy-signal`)
  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.CH_AI_API_KEY || ''
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DB_PATH: join(SIGNAL_DATA, 'test-org.db'),
    // Generous trial AI credits per account so 2-player AI works out of the box.
    AI_TRIAL_GRANT_USD: process.env.AI_TRIAL_GRANT_USD || '25'
  }
  if (aiKey) env.ANTHROPIC_API_KEY = aiKey
  const out = openSync(SIGNAL_LOG, 'a')
  const child = spawn(tsx, ['src/server.ts'], {
    cwd: SIGNAL,
    env,
    detached: true,
    stdio: ['ignore', out, out]
  })
  child.unref()
  log(`• Starting signal server (pid ${child.pid}) on ${HTTP} …`)
  log(`  AI proxy: ${aiKey ? 'ENABLED (key from env, not stored)' : 'off — export ANTHROPIC_API_KEY before setup for 2-player AI'}`)
  const up = await waitHealthz(30_000)
  if (!up) die(`signal server did not become healthy — see ${SIGNAL_LOG}`)
  log(`• Signal healthy at ${HTTP}`)
  return child.pid
}

// ── org + accounts ───────────────────────────────────────────────────────────
async function signup(person) {
  const email = emailFor(person)
  const r = await httpJson('/accounts/signup', {
    method: 'POST',
    body: {
      email,
      password: PASSWORD,
      handle: person.first.toLowerCase(),
      firstName: person.first,
      lastName: person.last
    }
  })
  if (r.json?.ok && r.json.sessionToken && r.json.account?.id) {
    return { email, token: r.json.sessionToken, accountId: r.json.account.id, created: true }
  }
  // Already exists (a re-run) — sign in instead.
  if (r.json?.error && /already exists/i.test(r.json.error)) {
    const s = await httpJson('/accounts/login', { method: 'POST', body: { email, password: PASSWORD } })
    if (s.json?.ok && s.json.sessionToken && s.json.account?.id) {
      return { email, token: s.json.sessionToken, accountId: s.json.account.id, created: false }
    }
  }
  die(`signup failed for ${email}: ${JSON.stringify(r.json)}`)
}

async function findExistingOrg(ownerToken) {
  const r = await httpJson('/orgs', { token: ownerToken })
  const list = r.json?.orgs ?? r.json?.organizations ?? []
  const hit = Array.isArray(list) ? list.find((o) => o.name === ORG_NAME) : null
  return hit?.id ?? null
}

async function createAccountsAndOrg() {
  log(`\nCreating ${PEOPLE.length} accounts …`)
  const users = []
  for (let i = 0; i < PEOPLE.length; i++) {
    const u = await signup(PEOPLE[i])
    users.push({ n: i + 1, ...PEOPLE[i], ...u, userDataDir: join(USERDATA_BASE, PEOPLE[i].first.toLowerCase()) })
    log(`  ${i + 1}. ${u.email} ${u.created ? '(new)' : '(existing)'}`)
  }

  const owner = users[0]
  let orgId = await findExistingOrg(owner.token)
  if (!orgId) {
    const r = await httpJson('/orgs', { method: 'POST', token: owner.token, body: { name: ORG_NAME } })
    orgId = r.json?.org?.id
    if (!orgId) die(`org create failed: ${JSON.stringify(r.json)}`)
    log(`\nOrg "${ORG_NAME}" created (${orgId}); ${owner.email} is owner.`)
  } else {
    log(`\nOrg "${ORG_NAME}" already exists (${orgId}).`)
  }

  log('Adding members …')
  for (const u of users.slice(1)) {
    const r = await httpJson(`/orgs/${orgId}/members`, {
      method: 'POST',
      token: owner.token,
      body: { email: u.email, role: 'member' }
    })
    if (!r.json?.ok) log(`  ! ${u.email}: ${JSON.stringify(r.json)}`)
    else log(`  + ${u.email}`)
  }
  return { orgId, users }
}

// ── seed a shared room + desk + document (so sharing is visible immediately) ──
async function seed(ownerToken, orgId) {
  const now = Date.now()
  const nodeBody = (id, parentId, kind, title, description) => ({
    id,
    parent_id: parentId,
    kind,
    title,
    description,
    status: 'open',
    priority: 3,
    interest: 3,
    importance: 3,
    sort_order: 0,
    created_at: now,
    updated_at: now
  })
  const items = [
    { itemType: 'node', body: nodeBody('seed-room-hq', null, 'folder', 'Company HQ', 'Shared org room — everyone here can see this.') },
    { itemType: 'node', body: nodeBody('seed-desk-team', 'seed-room-hq', 'task', 'Team Desk', 'Shared desk. Add widgets in one window and watch them sync to the others.') },
    {
      itemType: 'document',
      body: {
        id: 'seed-doc-charter',
        doc_type: 'doc',
        title: 'Team Charter',
        // Real Tiptap content so the doc opens with visible text (not blank) and
        // gives you something to co-edit across windows.
        body: JSON.stringify({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Team Charter' }] },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This is a shared document. Edit it from any window signed in to Plexi Test Org and watch the changes sync to the others.'
                }
              ]
            }
          ]
        }),
        archived: 0,
        created_at: now,
        updated_at: now
      }
    }
  ]
  log('\nSeeding shared room + desk + document …')
  for (const it of items) {
    const r = await httpJson(`/workspace/org/items/${it.body.id}`, {
      method: 'PUT',
      token: ownerToken,
      org: orgId,
      body: { itemType: it.itemType, body: it.body }
    })
    if (!r.json?.ok) log(`  ! ${it.itemType} ${it.body.id}: ${JSON.stringify(r.json)}`)
    else log(`  + ${it.itemType}: ${it.body.title}`)
  }
}

// A fresh org has NO chat channel and members are not auto-enrolled, so a
// teammate who never creates/joins a channel receives nothing (the real cause of
// "chats aren't going through"). Seed a #general channel and join every member,
// using only the public endpoints, so chat is testable out of the box. Idempotent:
// reuses an existing #general instead of creating duplicates on a re-run.
async function seedChannel(users, orgId) {
  const owner = users[0]
  log('\nSeeding a #general chat channel + joining all members …')
  let channelId = null
  const existing = await httpJson(`/orgs/${orgId}/channels`, { token: owner.token })
  const found = (existing.json?.channels ?? []).find(
    (c) => (c.name || c.title || '').toLowerCase() === 'general'
  )
  if (found) channelId = found.id ?? found.conversationId ?? found.conversation_id ?? null
  if (!channelId) {
    const r = await httpJson(`/orgs/${orgId}/channels`, {
      method: 'POST',
      token: owner.token,
      body: { name: 'general' }
    })
    channelId = r.json?.conversationId ?? null
    if (!channelId) {
      log(`  ! could not create #general: ${JSON.stringify(r.json)}`)
      return
    }
    log(`  + #general created (${channelId})`)
  } else {
    log(`  = #general already exists (${channelId})`)
  }
  for (const u of users.slice(1)) {
    const r = await httpJson(`/conversations/${channelId}/join`, { method: 'POST', token: u.token })
    if (!r.json?.ok) log(`  ! ${u.email} join: ${JSON.stringify(r.json)}`)
  }
  log(`  + all members joined #general`)
}

async function verifySeed(memberToken, orgId) {
  const r = await httpJson('/workspace/org/sync?since=0', { token: memberToken, org: orgId })
  const ids = (r.json?.items ?? []).map((i) => i.id)
  const ok = ids.includes('seed-desk-team') && ids.includes('seed-doc-charter')
  log(`\nVerify (a 2nd member pulls the org): seeded desk+doc visible = ${ok ? 'YES' : 'NO'} (${ids.length} items on server)`)
  return ok
}

// ── build the app pointed at the local signal ────────────────────────────────
function buildApp() {
  log('\nBuilding the app pointed at the local signal (out/ will target this test signal) …')
  const env = {
    ...process.env,
    VITE_USE_LOCAL_SIGNAL: 'true',
    VITE_SIGNAL_HTTP_URL: HTTP,
    VITE_SIGNAL_WS_URL: WS
  }
  const r = spawnSync('npm', ['run', 'build'], { cwd: REPO, env, stdio: 'inherit' })
  if (r.status !== 0) die('app build failed')
  log('• Build complete — out/ now talks to the local test signal.')
}

// ── launch an Electron window for one account ────────────────────────────────
function launchInstance(state, user) {
  mkdirSync(user.userDataDir, { recursive: true })
  const electron = join(REPO, 'node_modules', '.bin', 'electron')
  if (!existsSync(electron)) die(`electron not found at ${electron}`)
  const env = { ...process.env, FB_TEST_USER_DATA: user.userDataDir }
  delete env.ELECTRON_RUN_AS_NODE // ensure a real GUI window, not a node process
  const child = spawn(electron, ['.'], { cwd: REPO, env, detached: true, stdio: 'ignore' })
  child.unref()
  state.launched = state.launched || {}
  state.launched[user.email] = child.pid
  writeState(state)
  log(`  ▸ window for ${user.first} <${user.email}> (pid ${child.pid})`)
}

// ── commands ─────────────────────────────────────────────────────────────────
function printCreds(state) {
  log('\n──────────────────────────────────────────────────────────────')
  log(` ${ORG_NAME}   signal: ${HTTP}   org: ${state.orgId}`)
  log(` password for every account: ${PASSWORD}`)
  log('──────────────────────────────────────────────────────────────')
  for (const u of state.users) {
    const role = u.n === 1 ? 'owner' : 'member'
    log(`  ${String(u.n).padStart(2)}. ${u.first} ${u.last.padEnd(8)}  ${u.email.padEnd(24)}  ${role}`)
  }
  log('──────────────────────────────────────────────────────────────')
  log(' Each window opens to the sign-in screen the first time; log in with')
  log(' the email above + the shared password. The login persists for that')
  log(' window (its own isolated profile), so you only sign in once per account.')
  log('')
  log(' IMPORTANT: after signing in, switch the active org to "Plexi Test Org"')
  log(' via the org switcher (top of the sidebar). New accounts land in their')
  log(' own Personal org by default; the shared room/desk/docs live in the test')
  log(' org, so every window must be on "Plexi Test Org" to see and share them.')
  log('')
}

async function cmdSetup() {
  ensureDirs()
  let state = readState() || {}
  state.port = PORT
  state.httpUrl = HTTP
  state.orgName = ORG_NAME
  state.signalPid = await startSignal(state)
  writeState(state)

  const { orgId, users } = await createAccountsAndOrg()
  state.orgId = orgId
  state.users = users.map((u) => ({ n: u.n, first: u.first, last: u.last, email: u.email, accountId: u.accountId, userDataDir: u.userDataDir }))
  writeState(state)

  await seed(users[0].token, orgId)
  await seedChannel(users, orgId)
  await verifySeed(users[1].token, orgId)

  buildApp()
  writeState(state)
  printCreds(state)
  log('Next:')
  log('  node tools/test-org/run.mjs open 3      # launch the first 3 windows')
  log('  node tools/test-org/run.mjs launch 5    # launch just Eve (#5)')
  log('  node tools/test-org/run.mjs stop        # tear everything down')
  log('')
}

async function cmdOpen(count) {
  const state = readState()
  if (!state?.users) die('no test org yet — run: node tools/test-org/run.mjs setup')
  if (!(state.signalPid && pidAlive(state.signalPid))) {
    state.signalPid = await startSignal(state)
    writeState(state)
  }
  const n = Math.max(1, Math.min(state.users.length, Number(count) || 3))
  log(`Launching ${n} window(s):`)
  for (const u of state.users.slice(0, n)) launchInstance(state, u)
  log('\nSign in to each with its email + the shared password (see `creds`).')
}

async function cmdLaunch(which) {
  const state = readState()
  if (!state?.users) die('no test org yet — run: node tools/test-org/run.mjs setup')
  if (!(state.signalPid && pidAlive(state.signalPid))) {
    state.signalPid = await startSignal(state)
    writeState(state)
  }
  let user = null
  if (/^\d+$/.test(String(which))) user = state.users[Number(which) - 1]
  else user = state.users.find((u) => u.email === which || u.first.toLowerCase() === String(which).toLowerCase())
  if (!user) die(`unknown account "${which}" — use 1..${state.users.length} or an email`)
  log(`Launching window:`)
  launchInstance(state, user)
}

function cmdStatus() {
  const state = readState()
  if (!state) return log('No test org set up yet.')
  log(`Org: ${state.orgName} (${state.orgId})`)
  log(`Signal: ${state.httpUrl} — ${state.signalPid && pidAlive(state.signalPid) ? `running (pid ${state.signalPid})` : 'stopped'}`)
  const launched = state.launched || {}
  const alive = Object.entries(launched).filter(([, pid]) => pidAlive(pid))
  log(`Windows open: ${alive.length ? alive.map(([e]) => e).join(', ') : 'none'}`)
}

function cmdStop() {
  const state = readState()
  if (!state) return log('Nothing to stop.')
  const launched = state.launched || {}
  for (const [email, pid] of Object.entries(launched)) {
    if (pidAlive(pid)) {
      try {
        process.kill(pid)
        log(`• closed window ${email}`)
      } catch {
        /* already gone */
      }
    }
  }
  state.launched = {}
  if (state.signalPid && pidAlive(state.signalPid)) {
    try {
      process.kill(state.signalPid)
      log(`• stopped signal (pid ${state.signalPid})`)
    } catch {
      /* gone */
    }
  }
  state.signalPid = null
  writeState(state)
  log('Stopped. Data kept under tools/test-org/.state — delete it to fully reset.')
}

// ── dispatch ─────────────────────────────────────────────────────────────────
const [cmd, arg] = process.argv.slice(2)
switch (cmd) {
  case 'setup':
    await cmdSetup()
    break
  case 'open':
    await cmdOpen(arg)
    break
  case 'launch':
    await cmdLaunch(arg)
    break
  case 'creds': {
    const s = readState()
    if (!s?.users) die('no test org yet — run setup')
    printCreds(s)
    break
  }
  case 'status':
    cmdStatus()
    break
  case 'stop':
    cmdStop()
    break
  default:
    log('PlexiDesk 4.0 — 10-user org test harness')
    log('Commands: setup | open [count] | launch <n|email> | creds | status | stop')
    log('2-player AI: export ANTHROPIC_API_KEY before `setup`.')
}
