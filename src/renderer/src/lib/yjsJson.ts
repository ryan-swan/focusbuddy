import * as Y from 'yjs'

// Reflect a plain JSON body into Yjs shared types so that structurally-distinct
// concurrent edits MERGE instead of clobbering. This is what lets the sheet,
// slides and desk editors — which speak whole-body JSON + onChange — co-edit:
// two people changing different cells/slides/widgets both survive, where a
// single shared string would be last-writer-wins on the entire document.
//
// Objects become Y.Map, arrays become Y.Array, primitives are stored as-is.
// reconcile() walks an existing tree and applies the MINIMAL set of changes to
// match the new JSON, so unchanged subtrees keep their Yjs identity (and thus
// merge with concurrent edits to other parts).

function toY(value: unknown): unknown {
  if (Array.isArray(value)) {
    const arr = new Y.Array<unknown>()
    arr.push(value.map(toY))
    return arr
  }
  if (value && typeof value === 'object') {
    const map = new Y.Map<unknown>()
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) map.set(k, toY(v))
    return map
  }
  return value
}

// Read a Yjs subtree back out as plain JSON.
export function yToJson(value: unknown): unknown {
  if (value instanceof Y.Map) {
    const out: Record<string, unknown> = {}
    value.forEach((v, k) => (out[k] = yToJson(v)))
    return out
  }
  if (value instanceof Y.Array) {
    return value.toArray().map(yToJson)
  }
  return value
}

function reconcileInto(parent: Y.Map<unknown>, key: string, v: unknown): void {
  const cur = parent.get(key)
  if (Array.isArray(v)) {
    if (cur instanceof Y.Array) reconcileArray(cur, v)
    else parent.set(key, toY(v))
  } else if (v && typeof v === 'object') {
    if (cur instanceof Y.Map) reconcileMap(cur, v as Record<string, unknown>)
    else parent.set(key, toY(v))
  } else if (cur !== v) {
    parent.set(key, v)
  }
}

function reconcileArray(arr: Y.Array<unknown>, list: unknown[]): void {
  // Index-aligned: recurse into matching object/array items, replace changed
  // primitives, append new tail, truncate removed tail. Good for grids and
  // lists addressed by position.
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    if (i >= arr.length) {
      arr.push([toY(v)])
      continue
    }
    const cur = arr.get(i)
    if (Array.isArray(v) && cur instanceof Y.Array) reconcileArray(cur, v)
    else if (v && typeof v === 'object' && cur instanceof Y.Map) reconcileMap(cur, v as Record<string, unknown>)
    else if (cur !== v) {
      arr.delete(i, 1)
      arr.insert(i, [toY(v)])
    }
  }
  if (arr.length > list.length) arr.delete(list.length, arr.length - list.length)
}

// Reconcile a target Y.Map to match `obj`. Wrap a sequence of these in a single
// Y.transact at the call site so peers see one update.
export function reconcileMap(map: Y.Map<unknown>, obj: Record<string, unknown>): void {
  for (const k of [...map.keys()]) if (!(k in obj)) map.delete(k)
  for (const [k, v] of Object.entries(obj)) reconcileInto(map, k, v)
}
