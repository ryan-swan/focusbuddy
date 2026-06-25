import type { Office, WorkWindow } from '../orgsClient'
import type { MapPerson } from './usePeopleMap'

// Pure structural transforms for the People Map — grouping people into offices
// and building the reporting hierarchy. Kept framework-free so they're unit
// tested directly (the React components are thin wrappers over these).

export const officeWindow = (o: Office, fallback: WorkWindow): WorkWindow =>
  o.workStart != null && o.workEnd != null ? { start: o.workStart, end: o.workEnd } : fallback

export interface OfficeGroup {
  office: Office | null // null = the "no office set" bucket
  people: MapPerson[]
}

// People grouped by office, in the offices' own order, with an appended
// "unassigned" group for anyone without an office (only if non-empty).
export function groupByOffice(people: MapPerson[], offices: Office[]): OfficeGroup[] {
  const byOffice = new Map<string | null, MapPerson[]>()
  for (const p of people) {
    const key = p.officeId
    if (!byOffice.has(key)) byOffice.set(key, [])
    byOffice.get(key)!.push(p)
  }
  const groups: OfficeGroup[] = offices.map((o) => ({ office: o, people: byOffice.get(o.id) ?? [] }))
  const unassigned = byOffice.get(null) ?? []
  if (unassigned.length) groups.push({ office: null, people: unassigned })
  return groups
}

export interface Hierarchy {
  roots: MapPerson[]
  childrenOf: (accountId: string) => MapPerson[]
}

// The reporting tree. A person is a root when they have no manager, or their
// manager isn't part of this people set (e.g. an external/removed manager), so
// nobody is ever dropped. Children and roots are sorted by handle for a stable
// render.
export function buildHierarchy(people: MapPerson[]): Hierarchy {
  const byId = new Map(people.map((p) => [p.accountId, p]))
  const kids = new Map<string, MapPerson[]>()
  const roots: MapPerson[] = []
  for (const p of people) {
    const mgr = p.managerAccountId
    if (mgr && byId.has(mgr) && mgr !== p.accountId) {
      if (!kids.has(mgr)) kids.set(mgr, [])
      kids.get(mgr)!.push(p)
    } else {
      roots.push(p)
    }
  }
  const byName = (a: MapPerson, b: MapPerson): number => a.handle.localeCompare(b.handle)
  roots.sort(byName)
  for (const list of kids.values()) list.sort(byName)
  return { roots, childrenOf: (id) => kids.get(id) ?? [] }
}
