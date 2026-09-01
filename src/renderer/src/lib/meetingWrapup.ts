import type { MeetingOrigin } from './startMeeting'

// After a meeting, the transcript becomes a real document and the things that
// came out of the meeting are kept together in one folder. Where that folder
// lives follows the meeting's origin, so a meeting started from a desk keeps its
// notes with that desk; anything else goes to a top-level meeting folder. The
// folder is a normal folder the user can rename, move, or re-file afterwards.

// A plain-text transcript rendered as a ProseMirror/Tiptap document body: one
// paragraph per line, blank lines preserved as empty paragraphs.
export function transcriptToDocBody(text: string): { type: 'doc'; content: unknown[] } {
  const lines = text.split('\n')
  const content = lines.map((line) =>
    line.trim().length > 0
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' }
  )
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

// The folder a meeting's output should default into. A desk-originated meeting
// nests under that desk; everything else sits at the top level (null parent).
function meetingParentFolder(origin: MeetingOrigin | null): string | null {
  if (origin && origin.kind === 'desk') return origin.nodeId
  return null
}

function shortDate(now: number): string {
  try {
    return new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return new Date(now).toISOString().slice(0, 10)
  }
}

export interface MeetingFolder {
  folderId: string
  folderName: string
}

// Create the folder that holds this meeting's transcript and any deliverables
// the user chooses to keep, under the logical parent for the origin. Returns
// null if the folder could not be created (the caller falls back to no folder).
export async function ensureMeetingFolder(
  origin: MeetingOrigin | null,
  title: string,
  now: number
): Promise<MeetingFolder | null> {
  const parent = meetingParentFolder(origin)
  const name = `${title || 'Meeting'} — ${shortDate(now)}`
  try {
    const folder = await window.api.fileManager.createFolder(parent, name)
    return folder ? { folderId: folder.id, folderName: name } : null
  } catch {
    return null
  }
}

// Save the transcript as a document and file it under the meeting folder.
// Returns the new document id, or null if it could not be created.
export async function saveTranscriptDoc(
  title: string,
  transcript: string,
  folderId: string | null
): Promise<string | null> {
  try {
    const doc = await window.api.documents.create({
      docType: 'doc',
      title: `${title || 'Meeting'} — transcript`,
      body: transcriptToDocBody(transcript)
    })
    if (doc) {
      // Always file the transcript into the Drive so it shows up in the file
      // tree, not just in the "unfiled documents" picker. Creating a document
      // alone does NOT add it to the Drive (that needs an fb_files row via
      // fileDocument). If the meeting folder could not be created (folderId
      // null) or filing into it fails, fall back to the Drive root so the
      // transcript is never left invisible.
      const filed = await window.api.fileManager
        .fileDocument(doc.id, folderId)
        .catch(() => null)
      if (!filed && folderId) {
        await window.api.fileManager.fileDocument(doc.id, null).catch(() => null)
      }
    }
    return doc?.id ?? null
  } catch {
    return null
  }
}

/** M1 (SPEC-003 Stage) — the live notes, preserved VERBATIM as their own
 *  document beside the transcript. Your words are never rewritten (§3.4);
 *  ⌘⇧M moments render as timestamp lines so they survive to M2, where they
 *  resolve into transcript anchors. Works with or without a recording — the
 *  Stage is notes-first, recording-optional. */
export async function saveMeetingNotesDoc(
  title: string,
  notes: string,
  moments: number[],
  now: number,
  folderId?: string | null
): Promise<string | null> {
  const fmt = (ms: number): string => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const momentLines = moments.length
    ? `\n\n---\n\nMarked moments\n${moments.map((m) => `- ⚑ ${fmt(m)}`).join('\n')}`
    : ''
  const body = `${notes.trim()}${momentLines}`.trim()
  if (!body) return null
  try {
    let target = folderId ?? null
    if (target === undefined || target === null) {
      const folder = await ensureMeetingFolder(null, title, now)
      target = folder?.folderId ?? null
    }
    const doc = await window.api.documents.create({
      docType: 'doc',
      title: `${title || 'Meeting'} — your notes`,
      body: transcriptToDocBody(body)
    })
    if (doc) {
      const filed = await window.api.fileManager.fileDocument(doc.id, target).catch(() => null)
      if (!filed && target) await window.api.fileManager.fileDocument(doc.id, null).catch(() => null)
    }
    return doc?.id ?? null
  } catch {
    return null
  }
}
