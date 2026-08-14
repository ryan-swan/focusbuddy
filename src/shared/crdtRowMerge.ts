// WS01 sync substrate — the table-row data model in CRDT terms (third migrated
// type).
//
// A row's CELLS are synced, each cell an independent last-write-wins register keyed
// by its column. This is the point of the row model: today the poll writes a whole
// row last-write-wins, so two people editing DIFFERENT cells of the same row lose
// one edit. Per-cell LWW converges both — and same-cell edits still resolve to the
// later write with a deterministic actor tiebreak.
//
// Row CREATION and DELETION are not modelled here; like widget/node creation they
// ride the poll (the safety net), and cell events dual-write alongside it. Folding a
// row's events is order-independent, the same convergence guarantee proven for
// widgets and nodes.

import { lwwMerge, type LWWRegister } from './crdt'
import { registerOf, type CellPayload, type ChangeEvent } from './crdtWidgetMerge'

export type { CellPayload }

export interface RowState {
  // column -> converged LWW register for that cell.
  cells: Map<string, LWWRegister<unknown>>
}

// Fold one row's cell events into its converged per-column registers. Pure and
// order-independent: each column folds by lwwMerge independently, so cross-column
// edits never contend and any delivery order (or duplicates) yields the same state.
export function foldRow(events: Iterable<ChangeEvent>): RowState {
  const cells = new Map<string, LWWRegister<unknown>>()
  for (const ev of events) {
    if (ev.field !== 'cell') continue
    const p = ev.payload as CellPayload
    if (p.at === undefined || typeof p.column !== 'string') continue
    const reg = registerOf(ev) // { value, timestamp: at, actor }
    const prior = cells.get(p.column) ?? null
    cells.set(p.column, prior ? lwwMerge(prior, reg) : reg)
  }
  return { cells }
}

// The converged cell values as a plain record (column -> value), for applying to a
// row. Only columns that have at least one event appear.
export function rowValues(state: RowState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [column, reg] of state.cells) out[column] = reg.value
  return out
}
