// Connector #2 — documents (documents): doc / sheet / slides, extracted via the shared
// extractDocText. The body of collectSources()'s second hardcoded arm, moved behind the
// Connector contract at I2 commit 1.
//
// ── I2 commit 2 — document ROOM LINEAGE (closes F-11) ───────────────────────────────
// Pre-I2 every document was stamped `roomId: null`, so document chunks carried no room
// lineage — 173 of the operator's corpus's chunks (all documents) were NULL-room. But a
// document is not loose: it is windowed on a desk canvas by an OFFICE-WRAPPER widget
// (doc/sheet/slides/map), and that desk sits in a room — the SAME room its sibling widgets
// are chunked under. The projector already resolves this "home desk" (officeDocHomes) but
// expresses it only as a containment edge; here we resolve it into the CHUNK lineage so a
// document carries the room of the desk it lives on, consistent with the widget connector
// (getNode(desk).parentId). A document filed in the Files manager instead (fb_files) uses
// that filing as a FALLBACK.
//
// Measured reality of THIS corpus (the reason the F-11 gate is a coverage invariant, not a
// <10%-share threshold): 0 of 30 documents are fb_files-filed, only 7 are windowed on a
// live desk, and 23 are neither — genuinely org-wide reference/seed material. Those 23, and
// all knowledge (fb_knowledge has no room column), CORRECTLY stay null. The fix resolves
// exactly the documents that HAVE a home; it never fabricates a room for one that doesn't.
//
// ── I2b ─────────────────────────────────────────────────────────────────────────────
// `collect` and `collectOne` share the single `toDoc` below. Room resolution is the part
// most at risk of divergence, so BOTH paths route through the same `resolveRooms` helper
// and the same pure `buildDocumentRoomMap` policy — the per-source path simply asks it for
// a one-element map. That costs the same office-wrapper scan the whole-corpus path does
// (bounded: 4 widget kinds), which is the honest trade for provable agreement: a document's
// room must not depend on whether it was indexed by an edit or by a rebuild.

import { listDocuments, getDocument, getLiveDocumentMeta } from '../../db/documents'
import { listNodes, getNode } from '../../db/nodes'
import { listWidgetsByKind } from '../../db/widgets'
import { extractDocText } from '../../workspaceRank'
import { locateDocument } from '../../db/files'
import { officeDocHomes, OFFICE_DOC_WIDGET_KINDS, type SourceOfficeWidget } from '@shared/projection'
import { buildDocumentRoomMap } from './documentRoom'
import type { DocumentMeta } from '@shared/types'
import type { Connector, SourceDoc } from './types'

// The room map for a given set of document ids — the ONE place document→room precedence is
// applied, shared by the whole-corpus scan and the live per-source path.
function resolveRooms(docIds: readonly string[]): Map<string, string> {
  // LIVE containers only (trashed/other-org excluded), same liveness test the widget
  // connector applies — a wrapper on a deleted desk must not home its document.
  const liveNodeIds = new Set(listNodes().map((n) => n.id))
  const wrappers: SourceOfficeWidget[] = []
  for (const kind of OFFICE_DOC_WIDGET_KINDS) {
    for (const w of listWidgetsByKind(kind)) {
      if (!liveNodeIds.has(w.taskId)) continue
      wrappers.push({ id: w.id, containerId: w.taskId, kind, content: w.content || '', createdAt: w.createdAt })
    }
  }
  // officeDocHomes: docId → its home desk (earliest wrapper wins) — the projector's own
  // resolver, reused so the chunk lineage and the graph node agree on which desk homes a doc.
  const homes = officeDocHomes(wrappers)
  return buildDocumentRoomMap(
    docIds,
    (docId) => homes.get(docId)?.id ?? null,
    // desk → room, exactly as the widget connector resolves a widget's room on that desk.
    (deskId) => getNode(deskId)?.parentId ?? null,
    // fallback: the Files-manager folder the document is filed under (0 in the current
    // corpus; a Files-tree id, used only when there is no canvas home).
    (docId) => locateDocument(docId)?.parentId ?? null
  )
}

// The ONE definition of "what a document looks like as a SourceDoc". Null for a document
// whose body is gone or whose format extracts to nothing — the same skips `collect` has
// always applied. (Measured on the real corpus: 43 of 73 documents extract to '' — 14 blank
// tiptap docs, 23 V1-shape sheets, 4 maps, 2 designs. Correct behaviour today; extending
// the extractors is I3's L1 work, not I2b's.)
function toDoc(meta: DocumentMeta, roomId: string | null): SourceDoc | null {
  const full = getDocument(meta.id)
  if (!full) return null
  const text = extractDocText(full.docType, full.body)
  if (!text) return null
  return {
    sourceType: 'document',
    sourceId: meta.id,
    title: meta.title,
    text,
    roomId,
    chunkDate: meta.updatedAt,
    sourceKind: meta.docType,
    // I3 (DEC-022): a spreadsheet is row-structured — the 'table' ladder splits on row
    // boundaries so a wide sheet is never cut mid-row (and F-19's now-extractable V1 sheets
    // ride it). doc/slides are prose. Short sheets (<size) are one chunk regardless, so this
    // only changes chunking for LARGE sheets — none on today's corpus, forward-looking.
    chunkStrategy: full.docType === 'sheet' ? 'table' : 'prose'
  }
}

export const documentConnector: Connector = {
  id: 'internal:document',
  kind: 'internal',
  sourceType: 'document',
  label: 'Documents',
  collect(emit) {
    const docs = listDocuments()
    const roomMap = resolveRooms(docs.map((d) => d.id))
    for (const meta of docs) {
      const doc = toDoc(meta, roomMap.get(meta.id) ?? null)
      if (doc) emit(doc)
    }
  },
  collectOne(sourceId) {
    // getLiveDocumentMeta applies listDocuments()'s exact archived + trashed + org filter.
    const meta = getLiveDocumentMeta(sourceId)
    if (!meta) return null
    return toDoc(meta, resolveRooms([sourceId]).get(sourceId) ?? null)
  }
}
