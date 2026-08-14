// WS01 sync substrate — the node data model in CRDT terms (second migrated type).
//
// A node (task / folder / desk) syncs two scalar fields, each a last-write-wins
// register: its `title` and its `parent` (parentId). Both are deterministic, so
// neither ever surfaces a manual conflict — two people renaming the same node, or
// reparenting it, converge on the later edit with a deterministic actor tiebreak.
//
// Sibling ORDER (sortOrder / beforeId) is deliberately NOT modelled here: correct
// convergent ordering needs a fractional-index / sequence CRDT, which is a later
// refinement. Until then order reconciles via the twenty-second poll, while title
// and parent converge live. Folding a node's events is order-independent, the same
// convergence guarantee proven for widgets.
//
// The generic register payload + helper live in crdtWidgetMerge (the shared event
// home); this module re-exports them and adds the node-specific fold.

import { lwwMerge, type LWWRegister } from './crdt'
import { registerOf, type ChangeEvent, type RegisterPayload } from './crdtWidgetMerge'

export { registerOf }
export type { RegisterPayload }

export type NodeField = 'title' | 'parent'

export interface NodeState {
  title: LWWRegister<string> | null
  parent: LWWRegister<string | null> | null
}

// Fold one node's events into its converged registers. Pure and order-independent:
// each field folds by lwwMerge, which is commutative up to the deterministic actor
// tiebreak, so any delivery order (or duplicates after a reconnect) yields the same
// state.
export function foldNode(events: Iterable<ChangeEvent>): NodeState {
  let title: LWWRegister<string> | null = null
  let parent: LWWRegister<string | null> | null = null
  for (const ev of events) {
    if (ev.field !== 'title' && ev.field !== 'parent') continue
    if ((ev.payload as RegisterPayload).at === undefined) continue
    const reg = registerOf(ev)
    if (ev.field === 'title') {
      const r = reg as LWWRegister<string>
      title = title ? lwwMerge(title, r) : r
    } else {
      const r = reg as LWWRegister<string | null>
      parent = parent ? lwwMerge(parent, r) : r
    }
  }
  return { title, parent }
}
