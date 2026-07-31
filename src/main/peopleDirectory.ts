// The people the assistant can be told about (Phase 4.7).
//
// People are the one mentionable kind the main process cannot look up for
// itself: they live on the signal server behind a session token the renderer
// holds, and there is no local table for them. So the renderer publishes what it
// has genuinely fetched, and this module holds it for the mention resolver —
// exactly the pattern db/search.ts already uses for mail, and for the same
// honest reason: coverage is "what the app has actually loaded", never a
// promise of the whole directory.
//
// Two consequences, both deliberate:
//   • Signed out, or the org never opened, the directory is EMPTY. The typeahead
//     then offers nobody and the resolver refuses a person reference — rather
//     than either of them inventing a plausible name.
//   • Nothing here is persisted. It is a cache of a live fetch, and a stale name
//     surviving a restart would be a claim about the workspace nobody checked.

export interface DirectoryPerson {
  accountId: string
  handle: string
  firstName: string | null
  lastName: string | null
  role: string
}

let people: DirectoryPerson[] = []

export function setPeopleDirectory(next: DirectoryPerson[]): void {
  people = next.map((p) => ({
    accountId: p.accountId,
    handle: p.handle,
    firstName: p.firstName ?? null,
    lastName: p.lastName ?? null,
    role: p.role
  }))
}

export function getDirectoryPerson(accountId: string): DirectoryPerson | null {
  return people.find((p) => p.accountId === accountId) ?? null
}

// The display name for a person, from whatever the directory genuinely has. The
// handle is the fallback because it is the one field that is always present.
export function personDisplayName(p: DirectoryPerson): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
  return full || p.handle
}
