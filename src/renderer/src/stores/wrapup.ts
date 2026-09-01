import { create } from 'zustand'
import type { ActionProposal } from '@shared/types'
import { useMeetingsStore } from './meetings'
import { getMeetingOrigin, clearMeetingOrigin } from '../lib/startMeeting'
import { ensureMeetingFolder, saveTranscriptDoc, saveMeetingNotesDoc } from '../lib/meetingWrapup'
import { transcribeRecording } from '../lib/transcribeRecording'
import { mergeTrackSegments, formatAttributedTranscript } from '../lib/transcriptMerge'

// End-of-conversation wrap-up. When a meeting or call ends with a recording, this
// drives the one honest pipeline: transcribe the mixed audio, ask the AI for a
// grounded summary and the deliverables that came out of it, save a Meeting
// record, and surface a review panel. Every failure (no key, no speech, AI error)
// resolves to an honest state, never a fabricated summary or silent success.

export type WrapupStatus = 'idle' | 'processing' | 'review' | 'error'

interface WrapupState {
  status: WrapupStatus
  title: string
  step: string // human-readable progress, e.g. "Transcribing…"
  summary: string
  transcript: string
  proposals: ActionProposal[]
  error: string | null
  needsApiKey: boolean
  // Where this meeting's output is kept. The transcript is saved as a document
  // in this folder, and the deliverables default to it too.
  folderId: string | null
  folderName: string
  transcriptDocId: string | null
  // DEC-079 — the Meeting record this wrap-up produced, so approved
  // deliverables can POINT back at it (sourceType 'meeting').
  meetingId: string | null
  begin: (input: {
    title: string
    buffer: ArrayBuffer
    mimeType: string
    durationSec: number
    /** M2 — per-participant attributed takes (C1): each is transcribed
     *  on-device and merged on the shared clock; the mixed buffer is only
     *  the fallback when per-track capture was unavailable. */
    tracks?: Array<{ accountId: string; buffer: ArrayBuffer; mimeType: string; offsetMs: number; durationSec: number }>
    /** accountId → display name, resolved at record time from the roster. */
    speakers?: Record<string, string>
    /** M2 (CR-11) — MEETING audio never goes to a cloud engine; set by the
     *  meeting store. Calls keep the provider preference until their own
     *  consent round. */
    forceLocalTranscription?: boolean
    /** The Stage notepad + ⌘⇧M anchors, saved verbatim beside the transcript. */
    notes?: string
    moments?: number[]
  }) => Promise<void>
  dismiss: () => void
}

export const useWrapupStore = create<WrapupState>((set) => ({
  status: 'idle',
  title: '',
  step: '',
  summary: '',
  transcript: '',
  proposals: [],
  error: null,
  needsApiKey: false,
  folderId: null,
  folderName: '',
  transcriptDocId: null,
  meetingId: null,

  begin: async ({ title, buffer, mimeType, durationSec, tracks, speakers, forceLocalTranscription, notes, moments }) => {
    set({ status: 'processing', title, step: 'Transcribing the conversation…', summary: '', transcript: '', proposals: [], error: null, needsApiKey: false, folderId: null, folderName: '', transcriptDocId: null, meetingId: null })
    // M1 — the notes are the user's words and must survive REGARDLESS of how
    // transcription goes: saved first, not gated on the pipeline succeeding.
    if ((notes && notes.trim()) || (moments && moments.length)) {
      void saveMeetingNotesDoc(title, notes ?? '', moments ?? [], Date.now())
    }
    try {
      await runWrapup({ title, buffer, mimeType, durationSec, tracks, speakers, forceLocalTranscription }, set)
    } catch (err) {
      // Any thrown/rejected step (IPC failure, network, an AI provider error)
      // resolves to an honest error state instead of an unhandled rejection —
      // this is the crash the user saw "after the meeting ends".
      set({
        status: 'error',
        error: `The meeting wrap-up could not finish: ${(err as Error)?.message ?? 'unknown error'}.`
      })
    }
  },

  dismiss: () => set({ status: 'idle', title: '', step: '', summary: '', transcript: '', proposals: [], error: null, needsApiKey: false, folderId: null, folderName: '', transcriptDocId: null, meetingId: null })
}))

// The wrap-up pipeline, extracted so `begin` can wrap the whole thing in one
// try/catch. Sets state through the store's setter.
interface WrapupInput {
  title: string
  buffer: ArrayBuffer
  mimeType: string
  durationSec: number
  tracks?: Array<{ accountId: string; buffer: ArrayBuffer; mimeType: string; offsetMs: number; durationSec: number }>
  speakers?: Record<string, string>
  forceLocalTranscription?: boolean
}

async function runWrapup(
  { title, buffer, mimeType, durationSec, tracks, speakers, forceLocalTranscription }: WrapupInput,
  set: (partial: Partial<WrapupState>) => void
): Promise<void> {
  let transcript = ''
  const segmentDrafts: Array<{
    speakerAccountId: string | null
    speakerName: string
    startMs: number
    endMs: number
    text: string
    confidence: number | null
  }> = []

  if (tracks && tracks.length > 0) {
    // M2 — the attributed path (C1): each participant's take is transcribed
    // ON-DEVICE (CR-11 — meeting audio never leaves the machine; there is no
    // cloud fallback here, failing honestly beats a second disclosure) and
    // merged on the shared clock. Attribution is exact by construction — no
    // model ever infers who spoke.
    const perTrack: Array<{
      accountId: string
      speakerName: string
      offsetMs: number
      segments: Array<{ startMs: number; endMs: number; text: string; confidence: number | null }> | null
      text: string
      durationSec: number
    }> = []
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      const who = speakers?.[track.accountId] || `Speaker ${i + 1}`
      set({ step: `Transcribing on-device — ${who} (${i + 1} of ${tracks.length})…` })
      const r = await transcribeRecording(track.buffer, track.mimeType, { forceLocal: true })
      if (!r.ok) {
        set({
          status: 'error',
          error: `On-device transcription failed for ${who}: ${r.error} Meeting audio never leaves this machine, so there is no cloud fallback — fix the local engine and re-run.`
        })
        return
      }
      perTrack.push({
        accountId: track.accountId,
        speakerName: who,
        offsetMs: track.offsetMs,
        segments: r.segments,
        text: r.transcript,
        durationSec: r.durationSec ?? track.durationSec
      })
    }
    segmentDrafts.push(...mergeTrackSegments(perTrack))
    transcript = formatAttributedTranscript(segmentDrafts)
  } else {
    // Legacy single-blob path (no per-track capture available). A meeting
    // still refuses the cloud (CR-11); calls keep the provider preference.
    const t = await transcribeRecording(buffer, mimeType, {
      forceLocal: forceLocalTranscription === true
    })
    if (!t.ok) {
      set({
        status: 'error',
        needsApiKey: t.reason === 'no_key',
        error:
          t.reason === 'no_key'
            ? 'Add a transcription key in Settings → AI to get summaries and deliverables from your calls.'
            : `Could not transcribe the conversation: ${t.error}`
      })
      return
    }
    transcript = t.transcript.trim()
  }
  if (!transcript) {
    set({ status: 'error', error: 'No speech was captured in this conversation, so there is nothing to summarise.' })
    return
  }

  // Keep the meeting's output together: create a folder from the meeting origin
  // (a desk-started meeting nests under that desk; otherwise a top-level folder),
  // and save the transcript into it as a real document. This is best-effort —
  // if filing fails the wrap-up still shows the summary and deliverables.
  const origin = getMeetingOrigin()
  const folder = await ensureMeetingFolder(origin, title, Date.now())
  const transcriptDocId = await saveTranscriptDoc(title, transcript, folder?.folderId ?? null)
  clearMeetingOrigin()
  set({
    transcript,
    step: 'Summarising and finding deliverables…',
    folderId: folder?.folderId ?? null,
    folderName: folder?.folderName ?? '',
    transcriptDocId
  })
  const r = await window.api.voiceNote.processMeetingEnd({ transcript, meetingTitle: title, durationSec })
  if (!r.ok) {
    set({
      status: 'error',
      needsApiKey: !!r.needsApiKey,
      error: r.needsApiKey
        ? 'Add an Anthropic API key in Settings → AI to get a summary and deliverables.'
        : `Could not summarise the conversation: ${r.error}`
    })
    return
  }

  const summary = r.summary ?? ''
  const proposals = r.proposals ?? []
  // Save a real Meeting record so the conversation is kept, best-effort — but
  // AWAITED now (DEC-079): its id is what lets an approved deliverable point
  // back at the meeting whose transcript produced it. A failed save degrades
  // to the old behaviour (items file without a link), never blocks the review.
  const meeting = await useMeetingsStore
    .getState()
    .create({
      title,
      transcript,
      summary,
      actionItems: proposals.filter((p) => p.kind === 'create-task').map((p) => ('title' in p ? p.title : '')),
      durationSec
    })
    .catch(() => null)

  // M2 — the segments ARE the transcript now; persist them against the
  // meeting record so the Thread rendering and Recall have data, not prose.
  if (meeting?.id && segmentDrafts.length) {
    await window.api.meetings.saveSegments(meeting.id, segmentDrafts).catch(() => null)
  }

  set({ status: 'review', summary, proposals, meetingId: meeting?.id ?? null })
}
