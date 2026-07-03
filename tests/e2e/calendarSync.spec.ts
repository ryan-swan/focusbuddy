/**
 * E2E: personal-workspace sync (rung 1) for calendar time blocks.
 *
 * Backing contract:
 *  - src/renderer/src/lib/workspaceSync.ts orchestrates push+pull: it reads
 *    window.api.workspaceSync.pending() (main-process, local SQLite), PUTs
 *    each dirty item to the server, marks it pushed, then GETs
 *    /workspace/sync?since=<cursor> and applies the result via
 *    window.api.workspaceSync.applyRemote().
 *  - src/main/db/workspaceSync.ts is the main-process half: collectPending(),
 *    markPushed(), applyRemote() against the local time_blocks table.
 *  - focusbuddy-signal/src/workspaceSync.ts is the server-side delta-sync
 *    store (schema-agnostic JSON body + discriminator).
 *
 * HARNESS LIMITATION (stated plainly, not hidden): the built test app loads
 * its renderer from file://, and Chromium blocks a file:// document's own
 * fetch() to a plain http:// origin ("TypeError: Failed to fetch" — verified
 * directly; the same call to https://focusbuddy-signal.fly.dev/healthz from
 * the identical renderer succeeded). Real (non-test) builds only ever fetch
 * https endpoints, so this only bites a hermetic local test server. That
 * means the renderer's OWN network glue in lib/workspaceSync.ts (a bare
 * fetch call with the session header) cannot be exercised end-to-end inside
 * this harness without either standing up TLS for the local server or
 * pointing the build at production (both worse ideas — see
 * rules/no-fakery.md and the "never touch prod" invariant).
 *
 * What this spec verifies instead, exercising every REAL layer except that
 * one renderer fetch call: the main-process IPC (window.api.workspaceSync.*,
 * window.api.timeBlocks.*) against a REAL local signal server, with this
 * test's own Node process performing the HTTP half using the exact same
 * request shapes the renderer would send (PUT /workspace/items/:id, GET
 * /workspace/sync, DELETE /workspace/items/:id). This is precisely the
 * "drive ONE instance plus direct HTTP assertions" fallback called for when
 * a full renderer-driven flow isn't reliably drivable in the harness.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

const SIGNAL_BASE = process.env.E2E_SIGNAL_BASE ?? 'http://localhost:8790'

test.beforeAll(async () => {
  const res = await fetch(`${SIGNAL_BASE}/healthz`).catch(() => null)
  test.skip(!res || !res.ok, `Local signal server not reachable at ${SIGNAL_BASE} — start it before running this spec.`)
  test.skip(
    /focusbuddy-signal\.fly\.dev/.test(SIGNAL_BASE),
    'Refusing to run account-creating sync tests against the production signal server.'
  )
})

let launched: LaunchedApp | null = null
let launched2: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
  if (launched2) {
    await launched2.dispose()
    launched2 = null
  }
})

interface PendingUpsert {
  id: string
  itemType: 'node' | 'widget' | 'timeblock'
  body: Record<string, unknown>
  baseRev: number
}
interface PendingDelete {
  id: string
  itemType: 'node' | 'widget' | 'timeblock'
  baseRev: number
}
interface ServerItem {
  id: string
  itemType: string
  body: Record<string, unknown> | null
  rev: number
  deleted: boolean
}

async function signup(email: string, password: string): Promise<string> {
  const res = await fetch(`${SIGNAL_BASE}/accounts/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error(`signup failed (${res.status}): ${await res.text()}`)
  const json = (await res.json()) as { ok: boolean; sessionToken: string }
  if (!json.ok) throw new Error('signup returned ok:false')
  return json.sessionToken
}

/** Push every pending timeblock upsert from a live instance to the real server, mirroring lib/workspaceSync.ts's putItem(). */
async function pushPending(token: string, pending: PendingUpsert[]): Promise<Array<{ id: string; rev: number }>> {
  const out: Array<{ id: string; rev: number }> = []
  for (const u of pending) {
    const res = await fetch(`${SIGNAL_BASE}/workspace/items/${u.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: u.itemType, body: u.body, baseRev: u.baseRev || undefined })
    })
    const json = (await res.json()) as { ok: boolean; item?: { rev: number }; error?: string }
    if (!res.ok || !json.ok) throw new Error(`push ${u.id} failed (${res.status}): ${JSON.stringify(json)}`)
    out.push({ id: u.id, rev: json.item!.rev })
  }
  return out
}

async function pushDeletes(token: string, deletes: PendingDelete[]): Promise<void> {
  for (const d of deletes) {
    const res = await fetch(`${SIGNAL_BASE}/workspace/items/${d.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`delete ${d.id} failed (${res.status})`)
  }
}

async function pullSince(token: string, since: number): Promise<{ items: ServerItem[]; now: number }> {
  const res = await fetch(`${SIGNAL_BASE}/workspace/sync?since=${since}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const json = (await res.json()) as { ok: boolean; items: ServerItem[]; now: number }
  if (!json.ok) throw new Error('pull failed')
  return json
}

test('weekly recurring block pushes to the server as timeblock items with deterministic ids, and series-delete tombstones propagate', async () => {
  const rand = Date.now()
  const token = await signup(`sync.cal.test.${rand}@example.com`, 'Test-Account-123!')

  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const NEXT_MONDAY_10AM_UTC = new Date('2026-08-03T10:00:00.000Z').getTime()

  const created = await window.evaluate(async (start) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.timeBlocks.create({
      taskId: null,
      title: 'Sync Test Recurring',
      startMs: start,
      durationMin: 30,
      recurrence: 'weekly'
    } as never)
  }, NEXT_MONDAY_10AM_UTC)
  const seriesId = (created as unknown as { id: string; seriesId: string }).seriesId

  // ── Push (main-process collect + this test's own HTTP, mirroring the renderer) ──
  const pending = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.pending()
  })
  const timeblockUpserts = pending.upserts.filter((u) => u.itemType === 'timeblock') as PendingUpsert[]
  expect(timeblockUpserts.length).toBeGreaterThanOrEqual(4) // 4-week horizon, matching recurringBlocks.spec.ts

  const pushed = await pushPending(token, timeblockUpserts)
  await window.evaluate(
    async (items: Array<{ id: string; rev: number }>) => {
      const api = (window as unknown as { api: typeof window.api }).api
      for (const it of items) await api.workspaceSync.markPushed('timeblock', it.id, it.rev)
    },
    pushed
  )

  // ── Assert against the server: itemType + deterministic ids ─────────────
  const { items: afterPush, now: cursor1 } = await pullSince(token, 0)
  const tb = afterPush.filter((i) => i.itemType === 'timeblock')
  expect(tb.length).toBeGreaterThanOrEqual(4)
  for (const item of tb) {
    // body round-trips the raw SQLite row (bodyFromRow in
    // src/main/db/workspaceSync.ts), so columns are snake_case, not the
    // camelCase shape window.api.timeBlocks returns.
    const body = item.body as { series_id?: string; start_ms?: number }
    expect(body.series_id).toBe(seriesId)
    if (item.id !== seriesId) expect(item.id).toBe(`${seriesId}@${body.start_ms}`)
    expect(item.deleted).toBe(false)
  }

  // ── Series-scoped delete locally, push tombstones, assert on the server ──
  await window.evaluate(async (id) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.timeBlocks.delete(id, 'series')
  }, created.id as unknown as string)

  const pendingAfterDelete = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.pending()
  })
  const timeblockDeletes = pendingAfterDelete.deletes.filter((d) => d.itemType === 'timeblock') as PendingDelete[]
  expect(timeblockDeletes.length).toBeGreaterThanOrEqual(4)
  await pushDeletes(token, timeblockDeletes)
  await window.evaluate(
    async (deletes: PendingDelete[]) => {
      const api = (window as unknown as { api: typeof window.api }).api
      for (const d of deletes) await api.workspaceSync.markPushed('timeblock', d.id, d.baseRev + 1)
    },
    timeblockDeletes
  )

  const { items: afterDelete } = await pullSince(token, cursor1)
  const tbAfterDelete = afterDelete.filter((i) => i.itemType === 'timeblock')
  expect(tbAfterDelete.length).toBeGreaterThanOrEqual(4)
  expect(tbAfterDelete.every((i) => i.deleted === true)).toBe(true)
})

test('a fresh instance applying a pull does not resurrect a tombstoned series', async () => {
  const rand = Date.now()
  const token = await signup(`sync.cal.fresh.${rand}@example.com`, 'Test-Account-123!')

  // ── Device A: create, collect, push to the real server ───────────────────
  launched = await launchApp()
  const winA = launched.window
  await waitForReady(winA)

  const start = new Date('2026-08-10T09:00:00.000Z').getTime()
  const created = await winA.evaluate(async (s) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.timeBlocks.create({
      taskId: null,
      title: 'Fresh Instance Recurring',
      startMs: s,
      durationMin: 30,
      recurrence: 'weekly'
    } as never)
  }, start)

  const pending = await winA.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.pending()
  })
  const upserts = pending.upserts.filter((u) => u.itemType === 'timeblock') as PendingUpsert[]
  const pushed = await pushPending(token, upserts)
  await winA.evaluate(
    async (items: Array<{ id: string; rev: number }>) => {
      const api = (window as unknown as { api: typeof window.api }).api
      for (const it of items) await api.workspaceSync.markPushed('timeblock', it.id, it.rev)
    },
    pushed
  )

  await launched.dispose()
  launched = null

  // ── Device B: fresh userData, pulls the LIVE series first ────────────────
  // (proves cross-device pull actually materialises occurrences locally,
  // not just that an empty pull is a no-op).
  launched2 = await launchApp()
  const winB = launched2.window
  await waitForReady(winB)

  const { items: liveItems, now: cursorB } = await pullSince(token, 0)
  const liveTb = liveItems.filter((i) => i.itemType === 'timeblock')
  expect(liveTb.length).toBeGreaterThanOrEqual(4)
  expect(liveTb.every((i) => i.deleted === false)).toBe(true)

  await winB.evaluate(
    async (remoteItems: ServerItem[]) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.workspaceSync.applyRemote(
        remoteItems.map((i) => ({
          id: i.id,
          itemType: i.itemType as 'node' | 'widget' | 'timeblock',
          body: i.body,
          rev: i.rev,
          deleted: i.deleted
        }))
      )
    },
    liveTb
  )

  const window1to2Range = [
    new Date('2026-08-01T00:00:00.000Z').getTime(),
    new Date('2026-10-01T00:00:00.000Z').getTime()
  ] as const
  const afterPullB = await winB.evaluate(
    async ([from, to]) => {
      const api = (window as unknown as { api: typeof window.api }).api
      // timeblocks:list also runs materializeRecurringBlocks() as a side
      // effect, so this call both reads AND exercises the "read re-extends
      // the series" path on device B — deliberately, since that is exactly
      // when a resurrection bug would show up.
      return api.timeBlocks.list(from, to)
    },
    window1to2Range
  )
  const materialisedOnB = (afterPullB as unknown as Array<{ title: string }>).filter(
    (b) => b.title === 'Fresh Instance Recurring'
  )
  expect(materialisedOnB.length).toBeGreaterThanOrEqual(4) // cross-device pull proven

  // ── The series is deleted (device A is gone) — tombstone directly via the
  // same HTTP contract the renderer's deleteItem() would use, keyed by the
  // ids device B already knows about from its earlier pull. ─────────────────
  for (const item of liveTb) {
    const res = await fetch(`${SIGNAL_BASE}/workspace/items/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.ok).toBe(true)
  }

  // ── Device B pulls the tombstones and must NOT keep showing the series ───
  const { items: afterDeleteItems } = await pullSince(token, cursorB)
  const tombstones = afterDeleteItems.filter((i) => i.itemType === 'timeblock')
  expect(tombstones.length).toBeGreaterThanOrEqual(4)
  expect(tombstones.every((i) => i.deleted === true)).toBe(true)

  await winB.evaluate(
    async (remoteItems: ServerItem[]) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.workspaceSync.applyRemote(
        remoteItems.map((i) => ({
          id: i.id,
          itemType: i.itemType as 'node' | 'widget' | 'timeblock',
          body: i.body,
          rev: i.rev,
          deleted: i.deleted
        }))
      )
    },
    tombstones
  )

  const finalBlocksOnB = await winB.evaluate(
    async ([from, to]) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.timeBlocks.list(from, to)
    },
    window1to2Range
  )
  const resurrected = (finalBlocksOnB as unknown as Array<{ title: string }>).filter(
    (b) => b.title === 'Fresh Instance Recurring'
  )
  expect(resurrected.length).toBe(0)
})
