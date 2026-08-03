// The one place that turns a person into the name we SHOW. Identity across the
// product is the person's real name; the handle and immutable id are routing
// keys, not display. Everything that renders a person (mentions, chat, invites,
// presence, collaborators) calls this so the rule is identical everywhere.
//
// Order of preference: full name, then either name alone, then the legacy
// handle, then the email local-part, then a neutral fallback. Never returns an
// empty string, so a nameless legacy account still renders something sensible
// rather than a blank.

export interface NamedPerson {
  firstName?: string | null
  lastName?: string | null
  handle?: string | null
  // Some payloads already carry a pre-composed name (e.g. an org member feed);
  // honour it when the parts are absent.
  name?: string | null
  email?: string | null
}

export function personDisplayName(p: NamedPerson | null | undefined, fallback = 'Someone'): string {
  if (!p) return fallback
  const full = [p.firstName, p.lastName].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
  if (full) return full
  const name = (p.name ?? '').trim()
  if (name) return name
  const handle = (p.handle ?? '').trim()
  if (handle) return handle
  const email = (p.email ?? '').trim()
  if (email.includes('@')) return email.split('@')[0]
  return fallback
}

// First name only, for greetings and compact chips ("Hi Jane", avatars). Falls
// back through the same chain as personDisplayName.
export function personFirstName(p: NamedPerson | null | undefined, fallback = 'there'): string {
  const first = (p?.firstName ?? '').trim()
  if (first) return first
  return personDisplayName(p, fallback).split(' ')[0]
}

// Up-to-two-letter initials for avatars. Uses first+last when present, else the
// first two meaningful characters of the display name.
export function personInitials(p: NamedPerson | null | undefined): string {
  const first = (p?.firstName ?? '').trim()
  const last = (p?.lastName ?? '').trim()
  if (first || last) return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
  const display = personDisplayName(p, '?')
  const parts = display.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return display.slice(0, 2).toUpperCase() || '?'
}
