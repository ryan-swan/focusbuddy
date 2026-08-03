import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
import type { Schema } from 'prosemirror-model'

// Seeding a collaborative document from its existing body is the one genuinely
// dangerous step in real-time co-editing: when a doc first goes live its CRDT is
// empty and the existing content has to be poured in, but if two clients both do
// it they each insert their own copy and the document doubles.
//
// The fix is determinism. We build the seed in a throwaway Y.Doc whose clientID
// is PINNED to a constant, so two clients seeding identical content produce
// byte-identical Yjs items (same clientID + same clocks). Yjs then merges them
// idempotently — the duplicate seed collapses to one — instead of concatenating.
// Real edits afterwards use each client's own random clientID as normal.
//
// This module stays free of the editor extension stack (which drags in React
// node views) so it is pure and unit-testable: the caller passes the ProseMirror
// JSON and the schema it already built for the editor.

// The Y.XmlFragment name @tiptap/extension-collaboration binds to by default.
export const COLLAB_FIELD = 'default'
// Pinned clientIDs so two clients seeding identical content produce byte-identical
// items that merge idempotently. The initial seed and the re-hydration seed use
// DIFFERENT ids: after a placeholder is deleted, reusing the initial id+clock would
// make Yjs treat the fresh content as items it has already seen (and deleted), so
// the content would vanish. A distinct id keeps re-hydrated content live while
// staying deterministic across clients.
const SEED_CLIENT_ID = 1
const REHYDRATE_CLIENT_ID = 2

// True if the ProseMirror JSON carries real (non-whitespace) text anywhere.
function pmHasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (n.type === 'text' && typeof n.text === 'string' && n.text.trim().length > 0) return true
  return Array.isArray(n.content) && n.content.some(pmHasText)
}

// True if the collab fragment holds real text (someone's actual content) — as
// opposed to being empty or holding only a placeholder empty paragraph. Strips the
// XML tags from the fragment's serialization; any remaining non-whitespace is text.
function fragmentHasText(frag: Y.XmlFragment): boolean {
  return frag.toString().replace(/<[^>]*>/g, '').replace(/\s+/g, '').length > 0
}

function seedInto(target: Y.Doc, pmJSON: object, schema: Schema, clientId: number): void {
  const seed = new Y.Doc()
  seed.clientID = clientId
  prosemirrorJSONToYXmlFragment(schema, pmJSON, seed.getXmlFragment(COLLAB_FIELD))
  Y.applyUpdate(target, Y.encodeStateAsUpdate(seed))
}

// Idempotently seed `target`'s collab fragment from a ProseMirror document JSON.
//
// Never touches a fragment that already holds real text — that would risk
// clobbering or doubling a teammate's live content. But a fragment that is empty,
// or holds only a placeholder empty paragraph (a room created before its body had
// content — e.g. a doc seeded/imported/shared while empty, then given content
// out-of-band), IS re-hydrated: the placeholder is cleared and the body's real
// content seeded in under a distinct pinned clientID.
export function seedYDocFromPm(target: Y.Doc, pmJSON: object, schema: Schema): void {
  const frag = target.getXmlFragment(COLLAB_FIELD)
  // Real content already present: leave it strictly alone.
  if (fragmentHasText(frag)) return
  // Body itself is empty: only seed a truly-empty fragment (don't re-add a
  // placeholder paragraph on top of an existing one every open).
  if (!pmHasText(pmJSON)) {
    if (frag.length === 0) seedInto(target, pmJSON, schema, SEED_CLIENT_ID)
    return
  }
  // Fragment is a placeholder (empty or lone empty paragraph) but the body has real
  // content: clear the placeholder, then re-seed with the distinct re-hydrate id.
  if (frag.length > 0) {
    target.transact(() => frag.delete(0, frag.length))
    seedInto(target, pmJSON, schema, REHYDRATE_CLIENT_ID)
  } else {
    seedInto(target, pmJSON, schema, SEED_CLIENT_ID)
  }
}
