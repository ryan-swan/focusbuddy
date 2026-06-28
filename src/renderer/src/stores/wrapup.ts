import { create } from 'zustand'
import type { ActionProposal } from '@shared/types'
import { useMeetingsStore } from './meetings'

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

  begin: async ({ title, buffer, mimeType, durationSec }) => {
    set({ status: 'processing', title, step: 'Transcribing the conversation…', summary: '', transcript: '', proposals: [], error: null, needsApiKey: false })

    const t = await window.api.voiceNote.transcribe({ buffer, mimeType })
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

    set({ step: 'Summarising and finding deliverables…', transcript })
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
    // Save a real Meeting record so the conversation is kept, best-effort.
    void useMeetingsStore
      .getState()
      .create({
        title,
        transcript,
        summary,
        actionItems: proposals.filter((p) => p.kind === 'create-task').map((p) => ('title' in p ? p.title : '')),
        durationSec
      })
      .catch(() => {})

    set({ status: 'review', summary, proposals })
  },

  dismiss: () => set({ status: 'idle', title: '', step: '', summary: '', transcript: '', proposals: [], error: null, needsApiKey: false })
}))
