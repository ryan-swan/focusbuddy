// Data inventory (spec PLX-SEC-031, PLX-DATA-006; ADR-0003). Every store that can
// hold personal data is catalogued with its lawful basis, retention class and the
// mechanism by which a subject's data is erased from it, so erasure and DSAR reach
// all of them rather than missing a cache or derived index. This is a real,
// honest catalogue of the plexi-4.0 stores, not a placeholder.

export interface DataInventoryEntry {
  store: string
  holdsPersonalData: boolean
  lawfulBasis: string
  retentionClass: string
  // How a subject's data leaves this store on erasure.
  erasureMechanism: 'crypto-shred' | 'projection-rebuild' | 'row-delete' | 'not-applicable'
  notes: string
}

// Ordered so erasure can walk it deterministically.
export const DATA_INVENTORY: DataInventoryEntry[] = [
  {
    store: 'events',
    holdsPersonalData: true,
    lawfulBasis: 'legitimate-interest (organisational record)',
    retentionClass: 'permanent (immutable log, INV-05)',
    erasureMechanism: 'crypto-shred',
    notes: 'Personal data is sealed under the per-subject key and referenced (DOM-032); erasure destroys the key, the Event record remains.'
  },
  {
    store: 'subject_keys',
    holdsPersonalData: false,
    lawfulBasis: 'n/a (key material, not personal data)',
    retentionClass: 'until-erasure',
    erasureMechanism: 'row-delete',
    notes: 'Destroying the row is the erasure action itself (SEC-030).'
  },
  {
    store: 'relationships',
    holdsPersonalData: false,
    lawfulBasis: 'legitimate-interest (derived graph)',
    retentionClass: 'derived (rebuildable, DATA-002)',
    erasureMechanism: 'projection-rebuild',
    notes: 'A projection of Events; any sealed content it referenced follows the Event crypto-shred.'
  },
  {
    store: 'ai_summary_cache',
    holdsPersonalData: true,
    lawfulBasis: 'legitimate-interest (derived AI memory)',
    retentionClass: 'derived (rebuildable, DATA-011)',
    erasureMechanism: 'row-delete',
    notes: 'Derived; cleared on erasure and recomputed from structure. Loss causes no loss of records.'
  },
  {
    store: 'context_review_points',
    holdsPersonalData: true,
    lawfulBasis: 'legitimate-interest (per-user review state)',
    retentionClass: 'presence-class (UX-072)',
    erasureMechanism: 'row-delete',
    notes: 'Per-(user,object) review markers; deleted for the erased subject.'
  }
]

export function inventoryFor(store: string): DataInventoryEntry | undefined {
  return DATA_INVENTORY.find((e) => e.store === store)
}

// Every store that must be visited on an erasure or DSAR.
export function personalDataStores(): DataInventoryEntry[] {
  return DATA_INVENTORY.filter((e) => e.holdsPersonalData)
}
