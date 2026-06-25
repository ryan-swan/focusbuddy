import { create } from 'zustand'
import type { Meeting, MeetingDraft, MeetingPatch } from '@shared/meetings'

// PlexiMeet store. Thin wrapper over the main-process meetings store via IPC.
// Reads only real meetings; an empty history shows an honest empty state.

interface MeetingsStore {
  meetings: Meeting[]
  loaded: boolean
  load: () => Promise<void>
  create: (draft: MeetingDraft) => Promise<Meeting | null>
  update: (id: string, patch: MeetingPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useMeetingsStore = create<MeetingsStore>((set, get) => ({
  meetings: [],
  loaded: false,
  load: async () => {
    const meetings = await window.api.meetings.list().catch(() => [] as Meeting[])
    set({ meetings, loaded: true })
  },
  create: async (draft) => {
    const m = await window.api.meetings.create(draft).catch(() => null)
    if (m) await get().load()
    return m
  },
  update: async (id, patch) => {
    await window.api.meetings.update(id, patch).catch(() => null)
    await get().load()
  },
  remove: async (id) => {
    await window.api.meetings.delete(id).catch(() => false)
    await get().load()
  }
}))
