// Collaboration presence model. The first layer of real-time collaboration is
// awareness: who has access to a shared document and who is editing it right now.
// This module is pure, so the colour assignment, initials, and ordering are
// testable without mounting the live-doc view. Live cursors and multi-user
// co-editing build on top of this in later waves.

export interface Collaborator {
  accountId: string
  handle: string
  // Deterministic per-account colour, so the same person is the same colour for
  // everyone and across sessions.
  color: string
  initials: string
  // Holds the edit lock right now (the live editor).
  editing: boolean
  // Is the current user.
  you: boolean
}

// A stable, pleasant colour for an account id. Deterministic hash → HSL hue with
// a fixed, legible saturation and lightness.
export function presenceColor(accountId: string): string {
  let h = 0
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 62% 48%)`
}

// Up to two initials from a handle like "@alex.kim" → "AK", "alex" → "AL".
export function initialsFor(handle: string): string {
  const parts = handle.replace(/@/g, '').trim().split(/[\s._-]+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Build the collaborator list for the presence bar: every member, de-duplicated,
// with the current editor (lock holder) flagged and ordered first, then the rest
// alphabetically. The current user is flagged so the UI can mark "you".
export function collaborators(
  members: Array<{ accountId: string; handle: string }>,
  lock: { holder: { accountId: string } | null } | null,
  myAccountId: string | null
): Collaborator[] {
  const holderId = lock?.holder?.accountId ?? null
  const seen = new Set<string>()
  const out: Collaborator[] = []
  for (const m of members) {
    if (seen.has(m.accountId)) continue
    seen.add(m.accountId)
    out.push({
      accountId: m.accountId,
      handle: m.handle,
      color: presenceColor(m.accountId),
      initials: initialsFor(m.handle),
      editing: m.accountId === holderId,
      you: m.accountId === myAccountId
    })
  }
  out.sort((a, b) => (a.editing === b.editing ? a.handle.localeCompare(b.handle) : a.editing ? -1 : 1))
  return out
}
