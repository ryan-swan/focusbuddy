// Pure @mention parsing shared by the chat renderer (highlighting) and the
// messaging store (mention-aware notifications). Lives in a .ts module so
// non-JSX callers (stores, unit tests) never import a .tsx file.

export const MENTION_RE = /@([a-z0-9._-]{2,32})/gi

export function bodyMentionsHandle(body: string, handle: string | null | undefined): boolean {
  if (!handle) return false
  const lower = handle.toLowerCase()
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (m[1].toLowerCase() === lower) return true
  }
  return false
}

// ── @mention autocomplete helpers ────────────────────────────────────────────
// Shared by any inline composer that offers member handles as the user types
// "@prefix". Pure so composers (chat, comments) and unit tests all agree.

export interface MentionQuery {
  // The text typed after the "@" so far (may be empty right after "@").
  query: string
}

// If the text ends in an in-progress mention ("@" at a word boundary followed by
// zero or more handle characters), return the partial query; else null.
export function matchMentionQuery(text: string): MentionQuery | null {
  const m = /(^|\s)@([a-z0-9._-]*)$/i.exec(text)
  if (!m) return null
  return { query: m[2] }
}

// Replace the in-progress "@prefix" at the end of the text with the chosen handle
// plus a trailing space. Returns the text unchanged when there is no mention in
// progress, so callers can apply it unconditionally.
export function applyMention(text: string, handle: string): string {
  const q = matchMentionQuery(text)
  if (!q) return text
  const upto = text.slice(0, text.length - q.query.length)
  return `${upto}${handle} `
}

// The candidate handles for a partial query: those that start with it, deduped
// case-insensitively, capped. Nothing is invented; an empty pool yields nothing.
export function filterMentionCandidates(handles: string[], query: string, limit = 6): string[] {
  const q = query.toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []
  for (const h of handles) {
    const l = h.toLowerCase()
    if (seen.has(l) || !l.startsWith(q)) continue
    seen.add(l)
    out.push(h)
    if (out.length >= limit) break
  }
  return out
}
