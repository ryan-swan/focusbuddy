# Epic: PlexiDesk → a Google-Workspace-class suite

Date opened: 2026-06-21.

## Why this exists

PlexiDesk already has a real office suite (Docs, Sheets, Slides) and a standalone
PlexiOffice app that syncs documents through the cloud. The goal of this epic is to
close the distance to Google Workspace along four lines the user asked for: a
Drive-like file and folder structure, sharing of folders and files between people,
the document-editor features that are still missing versus Google, and a new
Draw.io-class diagram and workflow tool called PlexiMaps. This is a multi-round
epic; each round ships something complete and verified rather than a half-built
layer. Round 1 (PlexiMaps) is done.

## Where the codebase stands today (measured 2026-06-21)

The file system is a single local tree in the `fb_files` table (folders, imported
files, and document references all as rows with `parent_id` nesting). It is
local-only and never reaches the server. Documents live in their own `documents`
table and can be "filed" into a folder via an `fb_files` row of kind `doc`.

Cloud sync already exists in three forms: personal `cloud_documents` (single-owner,
last-write-wins, what PlexiOffice uses), `live_docs` with `live_doc_members` and a
check-out lock (real collaboration, owner/editor roles, invite by handle), and
`live_files` blobs for live folders. Sharing today is token-and-snapshot: a folder
or widget can be shared as a point-in-time snapshot with `view` or `copy` scope,
optionally by email invite. What does not exist yet is true person-to-person
sharing of a folder or file with persistent, permissioned, live access, the
viewer/commenter/editor permission levels, and any team/shared-drive concept.

The editors are strong but have clear gaps versus Google. Docs lacks comments and
suggestions, track-changes, and page/print layout. Sheets lacks filters,
conditional formatting, data validation, cross-sheet references, pivot tables, and
a deeper function library. Slides lacks element animations, master slides, .pptx
import, a real shape library, and embedded charts. Full file:line findings are in
the exploration that opened this epic.

## Round 1 — PlexiMaps (DONE, 2026-06-21)

PlexiMaps shipped as a first-class `map` document type, a sibling of doc/sheet/
slides, built on React Flow (`@xyflow/react`, already vendored). It works standalone
in PlexiOffice, embeds on the PlexiDesk canvas, opens from the Documents hub, and
syncs through the same cloud-documents path as the other editors.

What it does: seven flowchart shapes (process, decision, terminator, data,
database/store, connector, text), connect-from-any-side edges with arrowheads,
double-click node rename and double-click edge labels, per-node colour, dashed vs
solid connectors, a minimap and fit-to-view, four starter templates (flowchart, org
chart, mind map, approval flow), and AI generation that turns a plain-language
description of a process into a laid-out diagram (the model returns nodes and edges,
`autoLayout` positions them top-down).

The persisted shape is a clean, tool-agnostic `MapBody` (nodes carry their own
position/shape/colour, edges carry an optional label and style) rather than React
Flow internals, so it stays portable and cloud-syncable. New files:
`src/shared/mapGraph.ts` (pure helpers), `src/renderer/src/components/documents/
MapEditor.tsx`, and `.../documents/map/mapTemplates.ts`. Integration touch-points:
`src/shared/types.ts`, `src/main/db/documents.ts`, `src/main/db/database.ts` (the
documents `doc_type` CHECK now allows `map`, plus `migrateDocumentsDocTypeCheck`
which rebuilds the table on existing databases — without it, every current user's DB
would reject a map), `src/main/ai/anthropic.ts` (the `map` generation branch),
`DocumentEditorView`, `PlexiOfficeApp`, `OfficeDocWidget`, `Canvas`, `widgetCatalog`,
`DocumentsView`, `OfficeDocAddDialog`, the documents store, the `@office` barrel, and
`cloudDocsClient`.

Verified: typecheck clean, hooks scan clean (410 files), 524 unit tests pass
including `tests/unit/mapGraph.test.ts` (17 cases over normalisation, layout, and
templates), the office e2e PO-4 creates a map and adds a shape, the office/canvas
regression suites pass (23 specs), and the DB migration was proven against an
old-schema database (old CHECK rejects `map`, migration fires, the existing row is
preserved, `map` then inserts, and re-running is a no-op).

Deferred for PlexiMaps specifically: image/PNG/SVG and .drawio export (needs an
image-capture dependency), swimlane containers, and connecting a PlexiDesk canvas
wire directly into a map node.

## Round 2 (proposed) — Drive-like files, folders, and the unified item model

Make the `fb_files` tree the real Drive: documents and maps appear in folders
natively rather than only as filed references, plus move/copy, a trash that already
exists, search across names, and breadcrumbs (the folder ops already exist in
`src/main/db/files.ts`). The bigger piece is pushing the folder tree to the cloud so
it is not device-local, which is the prerequisite for sharing folders. This round is
additive and mostly local-plus-sync; it does not need the collaboration server to
change shape.

## Round 3 (proposed) — Sharing folders and files between people

Add real person-to-person sharing on top of the existing accounts and `live_docs`
membership model: a server-side shared-folder entity with a members table carrying
viewer / commenter / editor roles, share-by-email-or-handle that resolves to an
account (not just a snapshot token), a persistent "Shared with me" that stays live
rather than a one-time copy, and link sharing with a real permission level. A
team / shared-drive concept (folders owned by a team rather than a person) is the
optional stretch. This is the most backend-heavy round and will need a signal-server
schema migration and ACL checks on every write path.

## Round 4 (proposed) — Editor parity with Google

Close the highest-value editor gaps, sequenced by user value. Sheets first
(filters, conditional formatting, data validation, cross-sheet references, then
pivot tables and more functions), then Docs (comments and suggestions, then
track-changes and page layout), then Slides (element animations, .pptx import, a
shape library, embedded charts). Each feature is independently shippable, so this
round is a long series of small, verified additions rather than one big change.

## Sequencing note

Rounds 2 and 3 are related: folder sync (Round 2) is the foundation that makes
folder sharing (Round 3) possible, so they should run in that order. Round 4 is
independent and can interleave whenever an editor feature is the priority. PlexiMaps
(Round 1) is complete and shipped behind the same cloud-sync contract as the rest of
the suite.
