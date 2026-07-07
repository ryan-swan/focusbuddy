import { create } from 'zustand'
import { setKnockHandler, sendKnock, type KnockEvent } from '../lib/messagingSocket'
import { notifyExternal } from '../lib/notify'
import { useMessagingStore } from './messaging'
import { useViewStore } from './view'
import { useCallStore } from './call'
import { personDisplayName } from '../lib/personName'

// PlexiPeople knock-to-connect. A knock is a lightweight "I want to reach you"
// ping between two people who can see each other. The receiver answers by
// replying (opens a direct message) or calling back, both through the surfaces
// already built; there is no separate answer channel. Nothing is persisted.

interface IncomingKnock {
  from: { accountId: string; handle: string; firstName?: string | null; lastName?: string | null }
  note: string | null
  at: number
}

interface KnockStore {
  // The newest unanswered incoming knock, shown as a notification. A second
  // knock replaces the first rather than stacking.
  incoming: IncomingKnock | null
  // A brief confirmation after you knock someone, e.g. "Knock sent to alex".
  sentTo: string | null
  ready: boolean

  init: () => void
  knock: (to: { accountId: string; handle: string; firstName?: string | null; lastName?: string | null }, note?: string) => void
  reply: () => Promise<void>
  callBack: () => void
  dismiss: () => void
}

export const useKnockStore = create<KnockStore>((set, get) => ({
  incoming: null,
  sentTo: null,
  ready: false,

  init: () => {
    if (get().ready) return
    setKnockHandler((e: KnockEvent) => {
      set({ incoming: { from: e.from, note: e.note, at: Date.now() } })
      // Alert when the app is in the background; clicking opens the chat.
      notifyExternal(`${personDisplayName(e.from, 'Someone')} knocked`, e.note ?? 'wants to reach you', {
        tag: `knock-${e.from.accountId}`,
        onClick: () => void get().reply()
      })
    })
    set({ ready: true })
  },

  knock: (to, note) => {
    sendKnock(to.accountId, note)
    const name = personDisplayName(to, to.handle)
    set({ sentTo: name })
    // Clear the confirmation after a few seconds.
    window.setTimeout(() => {
      if (get().sentTo === name) set({ sentTo: null })
    }, 4000)
  },

  reply: async () => {
    const inc = get().incoming
    if (!inc) return
    set({ incoming: null })
    const r = await useMessagingStore.getState().startDm(inc.from.handle)
    useViewStore.getState().goMessages()
    if (r.ok) await useMessagingStore.getState().openConversation(r.id)
  },

  callBack: () => {
    const inc = get().incoming
    if (!inc) return
    set({ incoming: null })
    void useCallStore.getState().startCall(inc.from, 'video')
  },

  dismiss: () => set({ incoming: null })
}))
