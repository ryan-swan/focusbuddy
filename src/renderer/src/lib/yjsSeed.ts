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
// Any fixed value works; it must be the same for every client's seed.
const SEED_CLIENT_ID = 1

// Idempotently seed `target`'s collab fragment from a ProseMirror document JSON.
// A no-op if the fragment already has content (already seeded, or being edited).
export function seedYDocFromPm(target: Y.Doc, pmJSON: object, schema: Schema): void {
  if (target.getXmlFragment(COLLAB_FIELD).length > 0) return
  const seed = new Y.Doc()
  seed.clientID = SEED_CLIENT_ID
  prosemirrorJSONToYXmlFragment(schema, pmJSON, seed.getXmlFragment(COLLAB_FIELD))
  Y.applyUpdate(target, Y.encodeStateAsUpdate(seed))
}
