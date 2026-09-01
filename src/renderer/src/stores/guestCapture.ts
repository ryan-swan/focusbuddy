// M6 (SPEC-003 P6, CR-12) — Guest Capture: record a meeting that happens
// OUTSIDE Plexii (Zoom, Meet, Teams — an external joinUrl booking, or any
// call playing through this machine). Reduced mode, exactly per CR-12:
//
//   - NO roster handshake — guests are not Plexii users; there is no consent
//     wire to send. The person responsible is the one who presses record,
//     and the disclosure bar on THEIR screen is non-dismissible while it
//     runs (the only verb is Stop).
//   - Attribution by construction, never by guess: the mic track is 'You';
//     the system-audio track is 'Them' — one mixed voice, labelled as such.
//     No AI ever invents a guest's name (the M1 doctrine, reduced).
//   - NO outbound-ask path: guests are filtered from the commitment
//     extractor's roster (wrapup), so nothing is ever owner-attributed to —
//     or sent toward — someone who never consented to be in the system.
//   - Mic-only is the honest floor: when system-audio loopback is
//     unavailable the capture continues and the bar SAYS "Plexii can hear
//     you, not them" (G1's ruling, named in the plan).
//
// Capture rides the same foundations as native meetings: per-track takes on
// one clock (MeetingTrackRecorder), CR-11 local-only transcription, the same
// wrap-up, and series identity stamped from the calendar origin so an
// external weekly gets prep and "carried from last time" like a native one.

import { create } from 'zustand'
import { MeetingTrackRecorder } from '../lib/trackRecorder'
import { useWrapupStore } from './wrapup'
import { markCalendarOrigin, clearMeetingOrigin } from '../lib/startMeeting'

/** The pseudo account ids of a guest capture's two tracks. 'me' is the
 *  house local-self placeholder (transcriptMerge stores it as null);
 *  GUESTS_ID marks the system-audio track and is EXCLUDED from the
 *  extractor roster (CR-12 — guests are never owners). */
export const GUESTS_ID = 'guests'

export type GuestCaptureMode = 'both' | 'mic-only'

interface GuestCaptureState {
  status: 'idle' | 'recording'
  mode: GuestCaptureMode
  title: string
  startedAt: number | null
  moments: number[]
  start: (opts: {
    title: string
    blockId?: string
    seriesId?: string | null
    agenda?: string | null
  }) => Promise<boolean>
  markMoment: () => void
  stop: () => void
}

let recorder: MeetingTrackRecorder | null = null
let micStream: MediaStream | null = null
let systemStream: MediaStream | null = null

function teardownStreams(): void {
  micStream?.getTracks().forEach((t) => t.stop())
  systemStream?.getTracks().forEach((t) => t.stop())
  micStream = null
  systemStream = null
}

export const useGuestCaptureStore = create<GuestCaptureState>((set, get) => ({
  status: 'idle',
  mode: 'mic-only',
  title: '',
  startedAt: null,
  moments: [],

  start: async ({ title, blockId, seriesId, agenda }) => {
    if (get().status === 'recording') return false
    // The mic is the floor: no mic, no capture at all.
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return false
    }
    // System audio, best-effort: arm the one-shot picker-free grant, take the
    // loopback audio, and throw the vehicle video track away immediately —
    // nothing visual is ever recorded. An empty audio track list is the
    // honest "this platform cannot hear them" answer, not an error.
    let mode: GuestCaptureMode = 'mic-only'
    try {
      await window.api.guestCapture.arm()
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      display.getVideoTracks().forEach((t) => t.stop())
      const audioTracks = display.getAudioTracks()
      if (audioTracks.length > 0) {
        systemStream = new MediaStream(audioTracks)
        mode = 'both'
      }
    } catch {
      systemStream = null
    }
    recorder = new MeetingTrackRecorder()
    recorder.tap('me', micStream)
    if (systemStream) recorder.tap(GUESTS_ID, systemStream)
    // Series identity rides the origin, exactly like a native calendar join.
    if (blockId || seriesId) markCalendarOrigin({ title, blockId, seriesId, agenda })
    else clearMeetingOrigin()
    set({ status: 'recording', mode, title, startedAt: Date.now(), moments: [] })
    return true
  },

  markMoment: () => {
    const t0 = recorder?.startedAt ?? get().startedAt
    if (get().status !== 'recording' || !t0) return
    set({ moments: [...get().moments, Date.now() - t0] })
  },

  stop: () => {
    const rec = recorder
    recorder = null
    const { title, moments } = get()
    set({ status: 'idle', title: '', startedAt: null, moments: [] })
    if (!rec) {
      teardownStreams()
      return
    }
    void rec.stop().then((take) => {
      teardownStreams()
      if (take.mixed) {
        void useWrapupStore.getState().begin({
          title,
          buffer: take.mixed.buffer,
          mimeType: take.mixed.mimeType,
          durationSec: take.mixed.durationSec,
          tracks: take.tracks,
          speakers: { me: 'You', [GUESTS_ID]: 'Them' },
          // CR-11 — meeting-grade audio: on-device only, no cloud fallback.
          forceLocalTranscription: true,
          notes: '',
          moments
        })
      }
    })
  }
}))
