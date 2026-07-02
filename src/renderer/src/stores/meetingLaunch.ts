import { create } from 'zustand'
import type { MeetingOrigin } from '../lib/startMeeting'

// Drives the "start a meeting" dialog. When a meeting is launched from an
// artifact (a document, sheet, deck, drawing, design or desk) the dialog opens
// so the user can add attendees and choose what access those attendees get to
// that artifact before the room starts. A meeting with no shareable source (a
// plain "Start a meeting", or one from a chat) skips the dialog and starts
// immediately, so this store is only ever populated for artifact origins.

interface MeetingLaunchStore {
  origin: MeetingOrigin | null
  open: (origin: MeetingOrigin) => void
  close: () => void
}

export const useMeetingLaunchStore = create<MeetingLaunchStore>((set) => ({
  origin: null,
  open: (origin) => set({ origin }),
  close: () => set({ origin: null })
}))
