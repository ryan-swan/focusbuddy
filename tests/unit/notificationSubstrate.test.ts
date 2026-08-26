// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ensureNotificationSchema,
  postNotification,
  canSuppress,
  effectiveDelivery,
  notEscalatedDigest,
  sweepDeliveries,
  scheduleBlockReminders,
  QUEUE_HOURLY_CAP,
  BLOCK_REMINDER_LEAD_MS,
  type SubstrateDb
} from '../../src/main/notifications/substrate'

// ARCHITECTURE §5 (Attention S4) — the notification substrate: durability,
// dedupe, per-queue rate caps with summary collapse, the block-reminder
// replacement, and the PLX-UX-043/044/045 contract assertions ported verbatim
// from the retired spec-conformance module.

function freshDb(): { raw: DatabaseSync; db: SubstrateDb } {
  const raw = new DatabaseSync(':memory:')
  const db: SubstrateDb = {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const s = raw.prepare(sql)
      return {
        run: (...a: unknown[]) => s.run(...(a as never[])),
        get: (...a: unknown[]) => s.get(...(a as never[])),
        all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
      }
    }
  }
  ensureNotificationSchema(db)
  return { raw, db }
}

describe('PLX-UX contract, ported from the retired decoy', () => {
  it('test_plx_ux_043_records_layer_and_trigger', () => {
    const { raw, db } = freshDb()
    const { posted } = postNotification(db, {
      queue: 'attention',
      title: 'X',
      layer: 'inbox',
      trigger: 'materiality>0.7'
    })
    expect(posted).toBe(true)
    const row = raw.prepare('SELECT layer, trigger FROM wi_notifications').get() as {
      layer: string
      trigger: string
    }
    expect(row).toEqual({ layer: 'inbox', trigger: 'materiality>0.7' })
    expect(() => postNotification(db, { queue: 'attention', title: 'Y', trigger: '' })).toThrow(
      /PLX-UX-043/
    )
  })

  it('test_plx_ux_044_security_never_suppressible', () => {
    expect(canSuppress('security')).toBe(false)
    expect(canSuppress('activity')).toBe(true)
    expect(effectiveDelivery('security', true)).toBe('delivered')
    expect(effectiveDelivery('activity', true)).toBe('suppressed')
    // And in the sweep itself: a suppressed queue silences activity rows but a
    // security row in the same queue still delivers.
    const { db } = freshDb()
    postNotification(db, { queue: 'q', title: 'act', trigger: 't', category: 'activity' })
    postNotification(db, { queue: 'q', title: 'sec', trigger: 't', category: 'security' })
    const out = sweepDeliveries(db, Date.now(), new Set(['q']))
    expect(out.map((d) => d.title)).toEqual(['sec'])
  })

  it('test_plx_ux_045_not_escalated_digest', () => {
    const { db } = freshDb()
    postNotification(db, { queue: 'q', title: 'quiet', trigger: 't', layer: 'ambient' })
    postNotification(db, { queue: 'q', title: 'loud', trigger: 't', layer: 'interruptive' })
    expect(notEscalatedDigest(db).map((n) => n.title)).toEqual(['quiet'])
  })
})

describe('dedupe — the once-ever contract', () => {
  it('a repeated dedupe_key is a silent no-op', () => {
    const { raw, db } = freshDb()
    const first = postNotification(db, { queue: 'q', title: 'A', trigger: 't', dedupeKey: 'k1' })
    const second = postNotification(db, { queue: 'q', title: 'A again', trigger: 't', dedupeKey: 'k1' })
    expect(first.posted).toBe(true)
    expect(second.posted).toBe(false)
    expect((raw.prepare('SELECT COUNT(*) AS n FROM wi_notifications').get() as { n: number }).n).toBe(1)
  })
})

describe('restart survival — deliver exactly once', () => {
  it('a scheduled row survives "restart" (same store, fresh sweep) and never re-fires', () => {
    const { db } = freshDb()
    const t0 = 1_000_000
    postNotification(db, { queue: 'q', title: 'later', trigger: 't', deliverAt: t0 + 5000, dedupeKey: 'r1' })
    expect(sweepDeliveries(db, t0)).toEqual([]) // not due yet
    // "restart": the durable row is still there; the next sweep delivers it…
    const out = sweepDeliveries(db, t0 + 6000)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('later')
    // …and it can never deliver again.
    expect(sweepDeliveries(db, t0 + 7000)).toEqual([])
  })
})

describe('backlog cap — the several-days-offline adversarial case (§5)', () => {
  it('overflowing queues collapse to EXACTLY one summary each; small queues deliver singly; critical bypasses', () => {
    const { db } = freshDb()
    const now = 5_000_000
    // Queue A: far over the cap.
    for (let i = 0; i < QUEUE_HOURLY_CAP + 15; i++) {
      postNotification(db, { queue: 'A', title: `a${i}`, trigger: 't', deliverAt: now - 1000 })
    }
    // Queue B: within budget.
    postNotification(db, { queue: 'B', title: 'b0', trigger: 't', deliverAt: now - 1000 })
    postNotification(db, { queue: 'B', title: 'b1', trigger: 't', deliverAt: now - 1000 })
    // A critical row in the overflowing queue still lands individually.
    postNotification(db, { queue: 'A', title: 'critical!', trigger: 't', deliverAt: now - 1000, critical: true })
    const out = sweepDeliveries(db, now)
    const aSummaries = out.filter((d) => d.queue === 'A' && d.kind === 'summary')
    const aSingles = out.filter((d) => d.queue === 'A' && d.kind === 'single')
    const bSingles = out.filter((d) => d.queue === 'B' && d.kind === 'single')
    expect(aSummaries).toHaveLength(1)
    expect(aSummaries[0].count).toBe(QUEUE_HOURLY_CAP + 15)
    expect(aSingles.map((d) => d.title)).toEqual(['critical!'])
    expect(bSingles).toHaveLength(2)
    // Everything marked: a second sweep is silent.
    expect(sweepDeliveries(db, now + 1000)).toEqual([])
  })

  it('the hourly budget counts recent singles', () => {
    const { db } = freshDb()
    const now = 9_000_000
    // Fill the hour's budget with delivered singles…
    for (let i = 0; i < QUEUE_HOURLY_CAP; i++) {
      postNotification(db, { queue: 'q', title: `s${i}`, trigger: 't', deliverAt: now - 500 })
    }
    expect(sweepDeliveries(db, now).filter((d) => d.kind === 'single')).toHaveLength(QUEUE_HOURLY_CAP)
    // …then one more due row within the hour collapses to a summary.
    postNotification(db, { queue: 'q', title: 'straw', trigger: 't', deliverAt: now + 100 })
    const out = sweepDeliveries(db, now + 200)
    expect(out).toEqual([expect.objectContaining({ kind: 'summary', queue: 'q', count: 1 })])
  })
})

describe('block reminders — the durable replacement (SPEC-024/029)', () => {
  it('schedules 5-minutes-before, once EVER per block occurrence, skips started/done', () => {
    const { db } = freshDb()
    const now = 10_000_000
    const blocks = [
      { id: 'b1', title: 'Deep work', startMs: now + 30 * 60 * 1000 },
      { id: 'b2', title: 'Started', startMs: now - 1000 },
      { id: 'b3', title: 'Done', startMs: now + 60 * 60 * 1000, status: 'done' }
    ]
    expect(scheduleBlockReminders(db, blocks, now)).toBe(1)
    // Re-sweep (the every-30s refresh): dedupe makes it a no-op — once EVER,
    // stronger than the retired sessionStorage set (which died with the app).
    expect(scheduleBlockReminders(db, blocks, now + 1000)).toBe(0)
    // It delivers exactly at the lead window, not before.
    expect(sweepDeliveries(db, blocks[0].startMs - BLOCK_REMINDER_LEAD_MS - 1000)).toEqual([])
    const out = sweepDeliveries(db, blocks[0].startMs - BLOCK_REMINDER_LEAD_MS + 1000)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Deep work')
  })
})

describe('DEC-018 A-2 — the Dispatch rail contract', () => {
  it('the substrate is generic and dispatch-free by name; the mission queues are reserved words', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'src', 'main', 'notifications', 'substrate.ts'),
      'utf-8'
    )
    const scheduler = readFileSync(
      join(__dirname, '..', '..', 'src', 'main', 'notifications', 'scheduler.ts'),
      'utf-8'
    )
    // No module, function, or table may take Caleb's reserved names — the only
    // allowed appearances are the reserved queue strings + the contract note.
    for (const file of [src, scheduler]) {
      expect(file).not.toMatch(/dispatcher|function dispatch|Dispatch[A-Z]/)
    }
    expect(src).toContain('mission-needs-you')
    expect(src).toContain('mission-done')
    // And posting to a reserved queue works today (D1 lands on a ready rail).
    const { db } = freshDb()
    const { posted } = postNotification(db, {
      queue: 'mission-needs-you',
      title: 'Consent needed',
      trigger: 'mission-pause',
      ref: 'mission-123'
    })
    expect(posted).toBe(true)
  })
})
