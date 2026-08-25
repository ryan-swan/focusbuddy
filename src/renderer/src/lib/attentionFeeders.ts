import type { FbNode } from '@shared/types'

// Attention feeders (S7, SPEC-022/023/024 intelligence-light; CR-08(b)'s
// enabler). Feeders READ desk/plan state and surface it AS attention signals —
// computed rows, never materialized work_items: no new data, no sync, nothing
// owned. Strictly one-directional (F006): Attention never writes back into
// desks. Signals stay OUT of the headline badge (system-class information;
// DEC-016's restraint) and carry a one-line reason like every other row.
//
// Dismissal is a MUTE, remembered per signal; muting several of one kind
// offers muting the whole source (Δ10's suppression shape, device-local).

export interface FeederSignal {
  /** Stable identity for muting: `${kind}:${id}` */
  key: string
  kind: 'desk-due' | 'desk-stale'
  id: string
  title: string
  /** The one-line reason ("Due tomorrow", "Quiet for 9 days"). */
  line: string
  /** Sort urgency — smaller = more urgent. */
  order: number
}

const DAY = 24 * 60 * 60 * 1000

export function deskDueSignals(nodes: FbNode[], nowMs: number): FeederSignal[] {
  const out: FeederSignal[] = []
  for (const n of nodes) {
    if (n.kind !== 'task' || n.archived || n.status === 'done' || n.status === 'parked') continue
    if (n.dueDate == null) continue
    const ms = n.dueDate - nowMs
    if (ms > 7 * DAY) continue
    const days = Math.floor(ms / DAY)
    const line =
      ms < 0
        ? 'Past due'
        : days === 0
          ? 'Due today'
          : days === 1
            ? 'Due tomorrow'
            : `Due in ${days} days`
    out.push({
      key: `desk-due:${n.id}`,
      kind: 'desk-due',
      id: n.id,
      title: n.title || 'Untitled desk',
      line,
      order: n.dueDate
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

export function deskStaleSignals(
  stale: Array<{ id: string; title: string; daysQuiet: number }>
): FeederSignal[] {
  return stale.map((d) => ({
    key: `desk-stale:${d.id}`,
    kind: 'desk-stale',
    id: d.id,
    title: d.title,
    line: `Quiet for ${d.daysQuiet} day${d.daysQuiet === 1 ? '' : 's'}`,
    order: -d.daysQuiet
  }))
}

/** Merge, apply mutes (per-signal keys plus whole-kind mutes), due first. */
export function feederSignals(
  nodes: FbNode[],
  stale: Array<{ id: string; title: string; daysQuiet: number }>,
  nowMs: number,
  muted: ReadonlySet<string>
): FeederSignal[] {
  const all = [...deskDueSignals(nodes, nowMs), ...deskStaleSignals(stale)]
  return all.filter((s) => !muted.has(s.key) && !muted.has(`kind:${s.kind}`))
}

// ── Mute persistence (device-local by design — a mute is "stop showing ME
// this here", never data) ───────────────────────────────────────────────────

const MUTE_KEY = 'attention.feeder.mutes'

export function loadMutes(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* fresh */
  }
  return new Set()
}

export function saveMutes(mutes: ReadonlySet<string>): void {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify([...mutes].slice(-500)))
  } catch {
    /* best-effort */
  }
}

/** Δ10 — after this many muted signals of one kind, offer muting the source. */
export const KIND_MUTE_OFFER_THRESHOLD = 3

export function mutedCountOfKind(mutes: ReadonlySet<string>, kind: FeederSignal['kind']): number {
  let n = 0
  for (const k of mutes) if (k.startsWith(`${kind}:`)) n++
  return n
}
