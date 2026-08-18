// The renderer half of the people directory (Phase 4.7).
//
// People are the one mentionable kind with no local table: they live on the
// signal server behind a session token, so the app has to fetch them and hand
// them to the main process for the mention resolver to read. That is the same
// arrangement db/search.ts already uses for mail — main knows exactly what the
// app genuinely loaded, and nothing more.
//
// Everything here fails quiet and empty. Signed out, offline, a personal
// workspace with no org, a request that errors: the directory stays empty, the
// typeahead offers nobody, and the resolver refuses a person reference. An
// empty directory is an honest answer; a fabricated name is not.

import { create } from 'zustand'
import { getOrg, type OrgMember } from './orgsClient'
import { useAccountStore } from '../stores/account'
import { useOrgStore, PERSONAL_ORG_ID } from '../stores/org'
import type { MentionRef } from './assistantMentions'

export interface DirectoryPerson {
  accountId: string
  handle: string
  firstName: string | null
  lastName: string | null
  email: string | null
  role: string
}

export function personName(p: DirectoryPerson): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
  return full || p.handle
}

function toDirectory(members: OrgMember[]): DirectoryPerson[] {
  return members.map((m) => ({
    accountId: m.accountId,
    handle: m.handle,
    firstName: m.firstName ?? null,
    lastName: m.lastName ?? null,
    email: m.email ?? null,
    role: m.role
  }))
}

interface PeopleStore {
  people: DirectoryPerson[]
  loading: boolean
  // True once a load has been attempted, so the picker can tell "nobody in this
  // workspace" from "not looked yet".
  attempted: boolean
  load: () => Promise<void>
}

export const usePeopleStore = create<PeopleStore>((set, get) => ({
  people: [],
  loading: false,
  attempted: false,
  load: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const token = useAccountStore.getState().sessionToken
      const orgId = useOrgStore.getState().activeOrgId
      // A personal workspace has no members to fetch, and signed out there is
      // no way to ask. Both land on an empty directory rather than an error.
      if (!token || !orgId || orgId === PERSONAL_ORG_ID) {
        set({ people: [], attempted: true })
        await window.api.people.setDirectory([]).catch(() => {})
        return
      }
      const detail = await getOrg(token, orgId)
      const people = detail ? toDirectory(detail.members) : []
      set({ people, attempted: true })
      // Publish to main so the resolver can read a mentioned person. Best
      // effort: failing to publish costs person-mentions, not the chat.
      await window.api.people.setDirectory(people).catch(() => {})
    } catch {
      set({ people: [], attempted: true })
      await window.api.people.setDirectory([]).catch(() => {})
    } finally {
      set({ loading: false })
    }
  }
}))

// Candidate person references for the "@" picker. Matches on name OR handle,
// because users think of colleagues both ways. Never invents an entry: an empty
// directory yields nothing at all.
export function personMentionCandidates(
  people: readonly DirectoryPerson[],
  query: string,
  conversationKey: string,
  limit = 4
): MentionRef[] {
  const q = query.trim().toLowerCase()
  const out: MentionRef[] = []
  for (const p of people) {
    const name = personName(p)
    if (q && !name.toLowerCase().includes(q) && !p.handle.toLowerCase().includes(q)) continue
    out.push({
      kind: 'person',
      id: p.accountId,
      title: name,
      icon: 'person',
      taskId: null,
      conversationKey
    })
    if (out.length >= limit) break
  }
  return out
}
