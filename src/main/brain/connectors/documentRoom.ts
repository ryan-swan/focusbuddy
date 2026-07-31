// The document→room RESOLUTION POLICY (plexi-brain I2 commit 2, F-11). PURE: no DB, no
// Electron — the lookups are injected. Kept separate from document.ts (which imports the
// DB-backed sources) so this precedence is unit-lockable in isolation, the same way
// orchestrate.ts and src/shared/indexReconcile.ts isolate their policies from their drivers.
//
// Precedence, for each document:
//   1. its office-wrapper HOME desk's room  (a doc windowed on a desk shares that desk's
//      room with its sibling widgets — the app's real document→room relationship)
//   2. else its Files-manager FILING's room (fallback for a doc filed in the Files tree)
//   3. else nothing — left OUT of the map, so the connector stamps null: a document that is
//      neither windowed nor filed is org-wide, exactly like curated knowledge.
// A home whose desk resolves to no room (a room-canvas wrapper) falls through to (2) then (3).

export function buildDocumentRoomMap(
  docIds: readonly string[],
  officeHomeDeskId: (docId: string) => string | null,
  deskRoomId: (deskId: string) => string | null,
  filingRoomId: (docId: string) => string | null
): Map<string, string> {
  const out = new Map<string, string>()
  for (const id of docIds) {
    const deskId = officeHomeDeskId(id)
    const room = (deskId ? deskRoomId(deskId) : null) ?? filingRoomId(id)
    if (room !== null) out.set(id, room)
  }
  return out
}
