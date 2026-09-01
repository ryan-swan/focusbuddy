import { create } from 'zustand'
import type { ActionProposal } from '@shared/types'
import { useMeetingsStore } from './meetings'
import { getMeetingOrigin, clearMeetingOrigin } from '../lib/startMeeting'
import { ensureMeetingFolder, saveTranscriptDoc } from '../lib/meetingWrapup'
import { transcribeRecording } from '../lib/transcribeRecording'

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
  begin: (input: { title: string; buffer: ArrayBuffer; mimeType: string; durationSec: number }) => Promise<void>
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

  begin: async ({ title, buffer, mimeType, durationSec }) => {
    set({ status: 'processing', title, step: 'Transcribing the conversation…', summary: '', transcript: '', proposals: [], error: null, needsApiKey: false, folderId: null, folderName: '', transcriptDocId: null, meetingId: null })
    try {
      await runWrapup({ title, buffer, mimeType, durationSec }, set)
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
async function runWrapup(
  { title, buffer, mimeType, durationSec }: { title: string; buffer: ArrayBuffer; mimeType: string; durationSec: number },
  set: (partial: Partial<WrapupState>) => void
): Promise<void> {
  const t = await transcribeRecording(buffer, mimeType)
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
  const transcript = t.transcript.trim()
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

  set({ status: 'review', summary, proposals, meetingId: meeting?.id ?? null })
}
