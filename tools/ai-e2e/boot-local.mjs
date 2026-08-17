#!/usr/bin/env node
// Boots an ISOLATED local signal (port 8795, own DB under .state) and seeds a
// real account + org + a shared desk and document, so the AI E2E runner has a
// genuine end-user workspace to drive through the mobile PWA at /m/.
//
// This touches none of your real or production data. `node boot-local.mjs stop`
// tears the signal down. Idempotent: re-running reuses existing accounts/org.
//
//   node boot-local.mjs         # start signal (if down) + seed + write creds.json
//   node boot-local.mjs stop    # stop the local signal

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..') // projects/focusbuddy
const SIGNAL = resolve(REPO, '../focusbuddy-signal')
const STATE = join(HERE, '.state')
const PID_FILE = join(STATE, 'signal.pid')
const CREDS_FILE = join(STATE, 'creds.json')
const LOG = join(STATE, 'signal.log')

const PORT = Number(process.env.TEST_ORG_PORT || 8795)
const HTTP = `http://localhost:${PORT}`
const WS = `ws://localhost:${PORT}/ws`
const ORG_NAME = 'AI E2E Org'
const PASSWORD = 'TestPlexi!2026'
const PEOPLE = [
  { first: 'Ava', last: 'Stone' },
  { first: 'Ben', last: 'Ortiz' }
]
const emailFor = (p) => `${p.first.toLowerCase()}@aie2e.local`

// Read one var out of ../../.env without sourcing the whole file (it contains a
// non KEY=VALUE line). Never printed.
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

async function healthz(timeoutMs = 1500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${HTTP}/healthz`)
      if (r.ok) return true
    } catch {}
    await sleep(300)
  }
  return false
}

async function startSignal() {
  if (await healthz(1200)) {
    console.log(`• signal already healthy at ${HTTP}`)
    return
  }
  mkdirSync(STATE, { recursive: true })
  const tsx = join(SIGNAL, 'node_modules', '.bin', 'tsx')
  if (!existsSync(tsx)) throw new Error(`tsx not found at ${tsx} (run npm install in focusbuddy-signal)`)
  const aiKey = envFromFile('ANTHROPIC_API_KEY')
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DB_PATH: join(STATE, 'ai-e2e.db'),
    AI_TRIAL_GRANT_USD: '25'
  }
  if (aiKey) env.ANTHROPIC_API_KEY = aiKey
  const out = openSync(LOG, 'a')
  const child = spawn(tsx, ['src/server.ts'], { cwd: SIGNAL, env, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  writeFileSync(PID_FILE, String(child.pid))
  console.log(`• starting signal (pid ${child.pid}) at ${HTTP} — AI proxy ${aiKey ? 'ENABLED' : 'off'}`)
  if (!(await healthz(30_000))) throw new Error(`signal did not become healthy — see ${LOG}`)
  console.log(`• signal healthy at ${HTTP}`)
}

async function api(path, { method = 'GET', token, org, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (org) headers['x-plexi-org'] = org
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${HTTP}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

async function ensureAccount(p) {
  const email = emailFor(p)
  const s = await api('/accounts/signup', {
    method: 'POST',
    body: { email, password: PASSWORD, handle: p.first.toLowerCase(), firstName: p.first, lastName: p.last }
  })
  if (s.json?.ok && s.json.sessionToken) return { email, token: s.json.sessionToken, id: s.json.account?.id }
  const l = await api('/accounts/login', { method: 'POST', body: { email, password: PASSWORD } })
  if (l.json?.ok && l.json.sessionToken) return { email, token: l.json.sessionToken, id: l.json.account?.id }
  throw new Error(`account setup failed for ${email}: ${JSON.stringify(s.json || l.json)}`)
}

async function ensureOrg(ownerToken) {
  const list = await api('/orgs', { token: ownerToken })
  const found = (list.json?.orgs ?? list.json?.organizations ?? []).find((o) => o.name === ORG_NAME)
  if (found) return found.id
  const r = await api('/orgs', { method: 'POST', token: ownerToken, body: { name: ORG_NAME } })
  if (!r.json?.org?.id) throw new Error(`org create failed: ${JSON.stringify(r.json)}`)
  return r.json.org.id
}

async function seed(ownerToken, orgId) {
  const now = Date.now()
  const node = (id, parent, kind, title, description) => ({
    id, parent_id: parent, kind, title, description,
    status: 'open', priority: 3, interest: 3, importance: 3, sort_order: 0, created_at: now, updated_at: now
  })
  const items = [
    { itemType: 'node', body: node('aie2e-room', null, 'folder', 'Company HQ', 'Shared room for the AI E2E run.') },
    { itemType: 'node', body: node('aie2e-desk', 'aie2e-room', 'task', 'Team Desk', 'Shared desk. Add and edit content here.') },
    {
      itemType: 'document',
      body: {
        id: 'aie2e-doc', doc_type: 'doc', title: 'Team Charter',
        body: JSON.stringify({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Team Charter' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'This is a shared document you can open and edit from the mobile app.' }] }
          ]
        }),
        archived: 0, created_at: now, updated_at: now
      }
    }
  ]
  for (const it of items) {
    const r = await api(`/workspace/org/items/${it.body.id}`, { method: 'PUT', token: ownerToken, org: orgId, body: { itemType: it.itemType, body: it.body } })
    console.log(`  ${r.json?.ok ? '+' : '!'} ${it.itemType}: ${it.body.title}`)
  }
}

// A fresh org has no chat channel, so seed a #general and join every member,
// mirroring the test-org harness, so the chat journey has somewhere to post.
async function seedChannel(users, orgId) {
  const owner = users[0]
  const existing = await api(`/orgs/${orgId}/channels`, { token: owner.token })
  let channelId = (existing.json?.channels ?? []).find((c) => (c.name || c.title || '').toLowerCase() === 'general')?.id ?? null
  if (!channelId) {
    const r = await api(`/orgs/${orgId}/channels`, { method: 'POST', token: owner.token, body: { name: 'general' } })
    channelId = r.json?.conversationId ?? null
  }
  if (!channelId) {
    console.log('  ! could not seed #general')
    return
  }
  for (const u of users.slice(1)) await api(`/conversations/${channelId}/join`, { method: 'POST', token: u.token })
  console.log(`  + #general channel ready (${channelId}); members joined`)
}

async function stop() {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8'))
    if (pid) {
      process.kill(pid)
      console.log(`• stopped signal (pid ${pid})`)
    }
  } catch {
    console.log('• no running signal recorded')
  }
}

async function main() {
  if (process.argv[2] === 'stop') return stop()
  await startSignal()
  const ava = await ensureAccount(PEOPLE[0])
  const ben = await ensureAccount(PEOPLE[1])
  const orgId = await ensureOrg(ava.token)
  await api(`/orgs/${orgId}/members`, { method: 'POST', token: ava.token, body: { email: ben.email, role: 'member' } })
  console.log(`• org "${ORG_NAME}" ready (${orgId}); ava owner, ben member`)
  await seed(ava.token, orgId)
  await seedChannel([ava, ben], orgId)
  const creds = {
    signalHttp: HTTP,
    signalWs: WS,
    pwaUrl: `${HTTP}/m/`,
    orgName: ORG_NAME,
    orgId,
    password: PASSWORD,
    accounts: [
      { role: 'owner', email: ava.email },
      { role: 'member', email: ben.email }
    ]
  }
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2))
  console.log(`\n• creds written to ${CREDS_FILE}`)
  console.log(`  PWA: ${creds.pwaUrl}  login: ${ava.email} / ${PASSWORD}`)
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
