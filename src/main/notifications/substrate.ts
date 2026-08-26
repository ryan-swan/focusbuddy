// The notification substrate (Attention layer S4; ARCHITECTURE §5, CR-03(a)).
//
// One durable, deduped, rate-capped notification store in the main process.
// Everything that notifies posts THROUGH here: the seven renderer callers
// (records-of-record for their live banners), the calendar block reminders
// (previously a renderer setInterval that died with the app — SPEC-024/029),
// the S5 capture closure, and — by the DEC-018 A-2 contract — Dispatch's
// mission events later (queues `mission-needs-you` / `mission-done` are
// reserved for D1; nothing else may take them).
//
// Ported from the retired spec-conformance module (PLX-UX-043/044/045):
// a notification is well-formed only with its escalation layer + trigger
// recorded; the security category can never be user-suppressed; the
// not-escalated digest is queryable in one place. Those assertions carry
// verbatim into this module's tests.
//
// Handle-taking core + electron-free, same testability pattern as
// nodeLifecycle/workItems. The scheduler (scheduler.ts) owns timers and the
// OS-banner side effects.

import { randomUUID } from 'crypto'

export interface SubstrateDb {
  exec(sql: string): void
  prepare(sql: string): {
    run(...args: unknown[]): unknown
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
}

export type NotificationCategory = 'security' | 'decision-risk' | 'attention' | 'activity' | 'digest'
export type EscalationLayer = 'ambient' | 'inbox' | 'interruptive'

// Per-queue OS-banner budget per rolling hour. Overflow collapses to ONE
// summary banner per queue (the several-days-offline backlog case) — never a
// storm. Security/critical rows bypass the collapse and deliver individually.
export const QUEUE_HOURLY_CAP = 5

export interface PostInput {
  ref?: string | null
  queue: string
  title: string
  body?: string
  /** Epoch ms; omit for "now". Future values are scheduled deliveries. */
  deliverAt?: number
  /** UNIQUE across all time — the restart-survival + once-ever guarantee. */
  dedupeKey?: string | null
  category?: NotificationCategory
  layer?: EscalationLayer
  /** PLX-UX-043: mandatory — what escalated this. */
  trigger: string
  origin?: 'human' | 'ai' | 'system'
  critical?: boolean
  /** True when the caller already showed the banner itself (the renderer's
   *  focus-gated live banners): the row is a record, not a pending delivery. */
  alreadyDelivered?: boolean
}

export function ensureNotificationSchema(d: SubstrateDb): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS wi_notifications (
      id TEXT PRIMARY KEY,
      ref TEXT,
      queue TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      deliver_at INTEGER NOT NULL,
      delivered_at INTEGER,
      collapsed INTEGER NOT NULL DEFAULT 0,
      dedupe_key TEXT UNIQUE,
      category TEXT NOT NULL DEFAULT 'attention',
      layer TEXT NOT NULL DEFAULT 'inbox',
      trigger TEXT NOT NULL,
      escalated INTEGER NOT NULL DEFAULT 0,
      wi_origin TEXT NOT NULL DEFAULT 'system',
      critical INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wi_notif_due ON wi_notifications(delivered_at, deliver_at);
    CREATE INDEX IF NOT EXISTS idx_wi_notif_queue ON wi_notifications(queue, delivered_at);
  `)
}

/** PLX-UX-044, ported verbatim: Security is exempt from user suppression. */
export function canSuppress(category: NotificationCategory): boolean {
  return category !== 'security'
}
export function effectiveDelivery(
  category: NotificationCategory,
  userSuppressed: boolean
): 'delivered' | 'suppressed' {
  if (category === 'security') return 'delivered'
  return userSuppressed ? 'suppressed' : 'delivered'
}

/** Post a notification. UX-043: refuses a missing trigger. Dedupe: a repeated
 *  dedupe_key is a silent no-op (the once-ever contract). */
export function postNotification(
  d: SubstrateDb,
  input: PostInput
): { posted: boolean; id: string | null } {
  if (!input.trigger) {
    throw new Error('A notification MUST record its escalation trigger (PLX-UX-043).')
  }
  const id = randomUUID()
  const now = Date.now()
  const res = d
    .prepare(
      `INSERT INTO wi_notifications
         (id, ref, queue, title, body, deliver_at, delivered_at, dedupe_key,
          category, layer, trigger, escalated, wi_origin, critical, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`
    )
    .run(
      id,
      input.ref ?? null,
      input.queue,
      input.title,
      input.body ?? '',
      input.deliverAt ?? now,
      input.alreadyDelivered ? now : null,
      input.dedupeKey ?? null,
      input.category ?? 'attention',
      input.layer ?? 'inbox',
      input.trigger,
      input.layer === 'interruptive' || input.critical ? 1 : 0,
      input.origin ?? 'system',
      input.critical ? 1 : 0,
      now
    ) as { changes?: number }
  const posted = (res?.changes ?? 0) > 0
  return { posted, id: posted ? id : null }
}

/** PLX-UX-045, ported: everything the platform chose NOT to escalate, in one place. */
export function notEscalatedDigest(
  d: SubstrateDb
): Array<{ id: string; queue: string; title: string; trigger: string }> {
  return d
    .prepare(
      'SELECT id, queue, title, trigger FROM wi_notifications WHERE escalated = 0 ORDER BY created_at DESC LIMIT 200'
    )
    .all() as never
}

export interface Delivery {
  kind: 'single' | 'summary'
  queue: string
  title: string
  body: string
  ref: string | null
  count: number
}

/**
 * The sweep (§5): find due undelivered rows, apply the per-queue hourly cap,
 * mark rows delivered, and return what the caller should actually SHOW.
 * Marking happens here — before the OS banner side effect — so a banner
 * failure can never re-fire rows (lose one banner, never storm).
 *
 * Cap semantics: per queue, if recent deliveries + due rows fit the budget,
 * each row is a 'single' delivery; otherwise the WHOLE due batch collapses to
 * one 'summary'. Security-category and critical rows always deliver singly.
 * `suppressedQueues` drops non-security banners (rows still mark delivered —
 * suppression silences, it never un-records; PLX-UX-044 keeps security out of
 * the set's reach).
 */
export function sweepDeliveries(
  d: SubstrateDb,
  nowMs: number,
  suppressedQueues: ReadonlySet<string> = new Set()
): Delivery[] {
  const due = d
    .prepare(
      `SELECT id, ref, queue, title, body, category, critical FROM wi_notifications
       WHERE delivered_at IS NULL AND deliver_at <= ? ORDER BY deliver_at ASC`
    )
    .all(nowMs) as Array<{
    id: string
    ref: string | null
    queue: string
    title: string
    body: string
    category: NotificationCategory
    critical: number
  }>
  if (!due.length) return []
  const markSingle = d.prepare(
    'UPDATE wi_notifications SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL'
  )
  const markCollapsed = d.prepare(
    'UPDATE wi_notifications SET delivered_at = ?, collapsed = 1 WHERE id = ? AND delivered_at IS NULL'
  )
  const recentFor = d.prepare(
    'SELECT COUNT(*) AS n FROM wi_notifications WHERE queue = ? AND collapsed = 0 AND delivered_at IS NOT NULL AND delivered_at > ?'
  )
  const byQueue = new Map<string, typeof due>()
  for (const row of due) {
    const list = byQueue.get(row.queue) ?? []
    list.push(row)
    byQueue.set(row.queue, list)
  }
  const out: Delivery[] = []
  for (const [queue, rows] of byQueue) {
    const priority = rows.filter((r) => r.category === 'security' || r.critical === 1)
    const normal = rows.filter((r) => !(r.category === 'security' || r.critical === 1))
    for (const r of priority) {
      markSingle.run(nowMs, r.id)
      out.push({ kind: 'single', queue, title: r.title, body: r.body, ref: r.ref, count: 1 })
    }
    if (!normal.length) continue
    const recent = (recentFor.get(queue, nowMs - 60 * 60 * 1000) as { n: number }).n
    const suppressed = suppressedQueues.has(queue)
    if (recent + normal.length <= QUEUE_HOURLY_CAP) {
      for (const r of normal) {
        markSingle.run(nowMs, r.id)
        if (!suppressed)
          out.push({ kind: 'single', queue, title: r.title, body: r.body, ref: r.ref, count: 1 })
      }
    } else {
      for (const r of normal) markCollapsed.run(nowMs, r.id)
      if (!suppressed)
        out.push({
          kind: 'summary',
          queue,
          title: `${normal.length} updates`,
          body: `${normal.length} notifications are waiting in ${queue} — open Plexii to review them.`,
          ref: null,
          count: normal.length
        })
    }
  }
  return out
}

/**
 * The calendar block reminders, moved to main (retiring the renderer
 * setInterval engine that died with the app): schedule a banner 5 minutes
 * before each upcoming planned block. The UNIQUE dedupe key (block id +
 * start) is the once-EVER guarantee — strictly stronger than the old
 * sessionStorage set, and it survives restarts (SPEC-024/029).
 */
export const BLOCK_REMINDER_LEAD_MS = 5 * 60 * 1000

export function scheduleBlockReminders(
  d: SubstrateDb,
  blocks: Array<{ id: string; title: string; startMs: number; status?: string }>,
  nowMs: number
): number {
  let scheduled = 0
  for (const b of blocks) {
    if (b.startMs <= nowMs) continue // already started — never alert late
    if (b.status === 'done') continue
    const minutes = Math.max(1, Math.round((b.startMs - nowMs) / 60000))
    const { posted } = postNotification(d, {
      ref: b.id,
      queue: 'calendar',
      title: b.title || 'Upcoming block',
      body: `Starts in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      deliverAt: Math.max(nowMs, b.startMs - BLOCK_REMINDER_LEAD_MS),
      dedupeKey: `block-reminder:${b.id}:${b.startMs}`,
      category: 'attention',
      layer: 'interruptive',
      trigger: 'time-block-lead',
      origin: 'system'
    })
    if (posted) scheduled++
  }
  return scheduled
}
