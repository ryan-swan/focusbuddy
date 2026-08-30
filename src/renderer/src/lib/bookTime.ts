// Book time — the dialog's pure logic (spec pass 1, steps 1–3). Lives here
// so it is unit-testable without JSX; BookTimeDialog.tsx is the surface.

export const DURATION_STEPS = [15, 25, 30, 45, 60, 90, 120]

/** The cycle entry rule (spec answer 7): a drag-seeded duration displays
 *  as-is and enters the cycle at the NEAREST step on first click — the seed
 *  is never clobbered by merely opening the dialog. */
export function nearestStepIndex(min: number): number {
  let best = 0
  for (let i = 1; i < DURATION_STEPS.length; i++)
    if (Math.abs(DURATION_STEPS[i] - min) < Math.abs(DURATION_STEPS[best] - min)) best = i
  return best
}

/** Placeholder resolution, recomputed on every state change (spec §TITLE):
 *  attached title → guest names → "Meeting" → room name → "Focus".
 *  DELIBERATELY no date/time fallback: a block already renders its time on
 *  the calendar, so a timestamp title is the calendar repeating itself (the
 *  spec's explicit refusal; the divergence from DEC-073's desk prefill is
 *  intentional — a desk carries no time of its own, a block does). */
export function resolvePlaceholder(opts: {
  mode: 'focus' | 'meeting'
  attachedTitle: string | null
  guests: string[]
  roomName: string | null
}): string {
  if (opts.attachedTitle?.trim()) return opts.attachedTitle.trim()
  if (opts.mode === 'meeting' && opts.guests.length > 0) return opts.guests.join(' & ')
  if (opts.mode === 'meeting') return 'Meeting'
  return opts.roomName?.trim() || 'Focus'
}

// ── Step 4 — guests ─────────────────────────────────────────────────────────

export interface GuestChip {
  name: string
  email: string
}

/** "The person you met yesterday is the person you're inviting": suggestions
 *  rank by recency of SHARED MEETINGS — the most recent block whose invite
 *  list carried the address wins — never alphabetically. The source is the
 *  real one the app already has: past time_blocks' meeting invitees. (Richer
 *  sources later: the PlexiPeople directory, and mail contacts once the
 *  GAP-017 messaging investigation lands.) */
export function rankGuestSuggestions(
  blocks: readonly { startMs: number; meeting?: { invitees: string[] } | null }[]
): GuestChip[] {
  const latest = new Map<string, number>()
  for (const b of blocks) {
    for (const raw of b.meeting?.invitees ?? []) {
      const email = raw.trim().toLowerCase()
      if (!email.includes('@')) continue
      latest.set(email, Math.max(latest.get(email) ?? 0, b.startMs))
    }
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([email]) => ({ email, name: nameFromEmail(email) }))
}

/** "alex.p-swan" → "Alex P Swan". The display name an email can honestly give. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0]
  const name = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
  return name || email
}

/** Two-letter avatar initials: first letters of the first two words, or the
 *  first two letters of a single word. */
export function guestInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/** Commit rule: an explicit address passes through; a bare word resolves
 *  against the contact list; an UNRESOLVED bare word gets the workspace
 *  domain appended. With no domain known the word is kept as typed — an
 *  invented domain would be a lie. */
export function resolveGuestEntry(
  raw: string,
  contacts: readonly GuestChip[],
  workspaceDomain: string | null
): GuestChip | null {
  const text = raw.trim().replace(/,+$/, '')
  if (!text) return null
  if (text.includes('@')) {
    const email = text.toLowerCase()
    return { email, name: nameFromEmail(email) }
  }
  const q = text.toLowerCase()
  const hit =
    contacts.find(
      (c) => c.name.toLowerCase().startsWith(q) || c.email.toLowerCase().startsWith(q)
    ) ?? contacts.find((c) => c.name.toLowerCase().includes(q))
  if (hit) return hit
  if (workspaceDomain) return { email: `${q.replace(/\s+/g, '.')}@${workspaceDomain}`, name: text }
  return { email: text, name: text }
}

/** The dropdown's rows: ranked contacts, minus the already-invited, filtered
 *  by the query, capped so the list stays a glance. */
export function filterSuggestions(
  contacts: readonly GuestChip[],
  query: string,
  takenEmails: readonly string[]
): GuestChip[] {
  const taken = new Set(takenEmails.map((e) => e.toLowerCase()))
  const q = query.trim().toLowerCase()
  return contacts
    .filter(
      (c) =>
        !taken.has(c.email.toLowerCase()) &&
        (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    )
    .slice(0, 6)
}

// ── Step 7 — commit, toast, and the invite hold ─────────────────────────────

/** The stated window the toast holds outbound invites for. Nothing sends
 *  today (CR-08/CR-09: no outbound mail path, no hosted meet links) — the
 *  hold is built NOW so that when sending exists, Undo already cancels it. */
export const HOLD_INVITES_MS = 10_000

export interface InviteHold {
  cancel: () => void
  /** True once the window elapsed without a cancel. */
  fired: () => boolean
}

/** Hold an action for a stated window. Undo calls cancel(); expiry runs the
 *  callback exactly once. The callback is the future send site — today its
 *  only caller passes the documented no-op. */
export function scheduleInviteHold(onExpire: () => void, ms: number = HOLD_INVITES_MS): InviteHold {
  let done = false
  let cancelled = false
  const timer = setTimeout(() => {
    if (cancelled) return
    done = true
    onExpire()
  }, ms)
  return {
    cancel: () => {
      cancelled = true
      clearTimeout(timer)
    },
    fired: () => done
  }
}

/** "3:00 – 3:45 PM" — the toast's time range. */
export function fmtTimeRange(startMs: number, durationMin: number): string {
  const f = (ms: number): string =>
    new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${f(startMs)} – ${f(startMs + durationMin * 60_000)}`
}

// ── Step 5, option B (operator ruling) — the shared block-token grammar ─────
//
// ONE parser, this dialog its first consumer, the command bar's future "book"
// verb its second. Deliberately NO @ tokens: @ already means Attention in ⌘K
// (DEC-031 arming) and mentions in chat — the @-as-guest question is its own
// later ruling, so "@sam" passes through untouched and guests stay chips.
// Mode keywords (meet/call/sync/1:1) are recognised but NEVER stripped — they
// are part of the name ("Roadmap sync" keeps its sync). Duration and #room
// strip on match, and every applied effect is echoed — a parser that eats
// text without showing what it did feels broken.

export interface RoomRef {
  id: string
  title: string
}

export interface BlockTokenEffects {
  cleaned: string
  durationMin: number | null
  room: RoomRef | null
  meeting: boolean
  echo: string | null
}

const DUR_RE = /(?:^|\s)(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?=\s|$)/i
const ROOM_RE = /(?:^|\s)#([\w][\w-]*)/
const MEET_KW_RE = /(?:^|\s)(meet|call|sync|1:1)(?=\s|$|[.,!?])/i

function fmtDur(min: number): string {
  return min >= 60 && min % 60 === 0 ? `${min / 60}h` : `${min}m`
}

/** Parse once over the whole field. `alreadyMeeting` keeps the echo honest —
 *  a keyword only echoes when it actually flips the mode. */
export function parseBlockTokens(
  text: string,
  rooms: readonly RoomRef[],
  alreadyMeeting = false
): BlockTokenEffects {
  let cleaned = text
  let durationMin: number | null = null
  let room: RoomRef | null = null
  const parts: string[] = []

  const d = DUR_RE.exec(cleaned)
  if (d) {
    const n = parseFloat(d[1])
    durationMin = Math.max(5, Math.round(/^h/i.test(d[2]) ? n * 60 : n))
    cleaned = (cleaned.slice(0, d.index) + ' ' + cleaned.slice(d.index + d[0].length))
      .replace(/\s{2,}/g, ' ')
      .trimStart()
    parts.push(`Set ${fmtDur(durationMin)}`)
  }

  const r = ROOM_RE.exec(cleaned)
  if (r) {
    const q = r[1].toLowerCase()
    const hit =
      rooms.find((x) => x.title.toLowerCase().startsWith(q)) ??
      rooms.find((x) => x.title.toLowerCase().includes(q))
    if (hit) {
      // Only a RESOLVED room strips — an unmatched #word stays visible
      // rather than vanishing into nothing.
      room = hit
      cleaned = (cleaned.slice(0, r.index) + ' ' + cleaned.slice(r.index + r[0].length))
        .replace(/\s{2,}/g, ' ')
        .trimStart()
      parts.push(`room \u201c${hit.title}\u201d`)
    }
  }

  const meeting = MEET_KW_RE.test(cleaned)
  if (meeting && !alreadyMeeting) parts.push('meeting')

  return {
    cleaned,
    durationMin,
    room,
    meeting,
    echo: parts.length ? parts.join(', ') : null
  }
}
