import type { SmartStackGroup, Widget } from '@shared/types'

// In-memory cache for Smart Stack proposals. Key = signature of the candidate widget set
// for the task. Re-clicking the button with the same set returns the cached proposal
// instantly (no second API call). Cache invalidates when widgets are added/removed/sectioned.

interface CachedProposal {
  groups: SmartStackGroup[]
  generatedAt: number
}

// Map<taskId, Map<signature, proposal>>
const cache = new Map<string, Map<string, CachedProposal>>()

// Signature of the unsectioned widget set — sorted IDs + count, so same set yields same key
export function signatureFor(widgets: Widget[]): string {
  const candidates = widgets
    .filter((w) => !w.archived && !w.pinned && w.kind !== 'section' && w.parentSectionId === null)
    .map((w) => w.id)
    .sort()
  return `${candidates.length}:${candidates.join(',')}`
}

export function getCachedProposal(
  taskId: string,
  signature: string
): CachedProposal | null {
  return cache.get(taskId)?.get(signature) ?? null
}

export function setCachedProposal(
  taskId: string,
  signature: string,
  groups: SmartStackGroup[]
): void {
  if (!cache.has(taskId)) cache.set(taskId, new Map())
  cache.get(taskId)!.set(signature, { groups, generatedAt: Date.now() })
}

// Drop all cached proposals for a task — call after a successful Smart Stack apply
// or when the user wants a fresh proposal.
export function invalidateCache(taskId: string): void {
  cache.delete(taskId)
}
