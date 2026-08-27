// DEC-039 — entity mentions on attention items: the people, desks, rooms and
// plans an item is ABOUT.
//
// Typed references, deliberately distinct from free-form tags (itemTags.ts):
// a tag is a word someone chose; a mention resolves to a real thing. Desk,
// room and plan mentions navigate. A PERSON mention is stored and shown
// today, and becomes a routed notification when SPEC-027 recipient routing
// exists — the reference is captured now so nothing has to be re-entered
// when the rails arrive.
//
// Stored as a JSON array in the `mentions` manifest column, so it syncs and
// is patchable like everything else. Parsing is defensive: garbage in the
// column yields [], never a crash — the column rides sync and a peer could
// write anything.

export const MENTION_KINDS = ['person', 'desk', 'room', 'plan'] as const
export type ItemMentionKind = (typeof MENTION_KINDS)[number]

export interface ItemMention {
  kind: ItemMentionKind
  id: string
  /** Display label frozen at pick time — shown even if the entity is later
   *  renamed or gone (a dangling mention degrades to text, never a blank). */
  title: string
}

const MAX_MENTIONS = 20
const MAX_TITLE = 60

const isKind = (v: unknown): v is ItemMentionKind =>
  typeof v === 'string' && (MENTION_KINDS as readonly string[]).includes(v)

export function parseMentions(raw: string | null | undefined): ItemMention[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: ItemMention[] = []
  const seen = new Set<string>()
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (!isKind(e.kind) || typeof e.id !== 'string' || !e.id.trim()) continue
    const key = `${e.kind}:${e.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const title = (typeof e.title === 'string' ? e.title : '').trim().slice(0, MAX_TITLE)
    out.push({ kind: e.kind, id: e.id, title: title || e.kind })
    if (out.length >= MAX_MENTIONS) break
  }
  return out
}

/** Null when empty — "no mentions" is NULL in the column, not "[]". */
export function serializeMentions(mentions: ItemMention[]): string | null {
  const clean = parseMentions(JSON.stringify(mentions))
  return clean.length ? JSON.stringify(clean) : null
}

export function mentionKey(m: Pick<ItemMention, 'kind' | 'id'>): string {
  return `${m.kind}:${m.id}`
}

export const MENTION_ICON: Record<ItemMentionKind, string> = {
  person: 'person',
  desk: 'desk',
  room: 'meeting_room',
  plan: 'account_tree'
}
