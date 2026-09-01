import type { ActionProposal } from '@shared/types'

// DEC-032 — where a desk-placed proposal goes.
//
// The assistant is shown a roster of real desk ids and may name one on
// create-page / create-widget / create-todo-list / create-table. Before this,
// no proposal could express a destination at all, so every card raised off a
// desk stopped to ask the user to pick one the assistant had already named in
// its prose (operator live QA).
//
// Pure and dependency-free so the resolution rules are unit-tested directly.

/**
 * The desk a proposal names for itself, resolved against the live desk list.
 *
 * An exact id is the happy path (that is what the roster gives the model). A
 * TITLE is accepted as a fallback, because a model that half-follows the
 * instruction should still land the user's intent rather than dropping them
 * into a chooser. Anything that matches nothing live resolves to null and the
 * normal "choose where" flow runs — a stale or invented id must never silently
 * retarget a different desk.
 */
export function resolveProposalDesk(
  p: ActionProposal,
  desks: ReadonlyArray<{ id: string; title: string }>
): string | null {
  const named = (p as { deskId?: string }).deskId?.trim()
  if (!named) return null
  const byId = desks.find((d) => d.id === named)
  if (byId) return byId.id
  const wanted = named.toLowerCase()
  const byTitle = desks.find((d) => (d.title || '').trim().toLowerCase() === wanted)
  return byTitle ? byTitle.id : null
}
