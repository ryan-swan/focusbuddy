import { create } from 'zustand'
import type {
  BodyDoubleChatMessage,
  BodyDoubleMode,
  BodyDoublePartner,
  BodyDoubleStatus
} from '@shared/types'
import { generateHandle } from '../lib/bodyDoubleHandle'
import {
  LocalMockMatcher,
  RemoteMatcher,
  type Matcher
} from '../lib/bodyDoubleMatcher'
import { signalConfig } from '../lib/signalConfig'

// Singleton matcher instance — created lazily on first use. Feature-flag
// chooses LocalMockMatcher (BroadcastChannel; two windows on the same
// machine can pair) vs RemoteMatcher (WebSocket to the hosted signaling
// service). The Matcher interface is the same either way, so the store
// doesn't care which one is wired up.
//
// Lives outside the store so hot-module-reload doesn't churn it on every
// renderer save.
let matcher: Matcher | null = null
function getMatcher(): Matcher {
  if (!matcher) {
    matcher = signalConfig.useRemote
      ? new RemoteMatcher(signalConfig.wsUrl)
      : new LocalMockMatcher()
  }
  return matcher
}

interface State {
  status: BodyDoubleStatus
  // Mode the user picked when starting the request — preserved across the
  // looking/matched/connected transitions so the UI can render "you're in
  // light-conversation mode" badges, etc.
  mode: BodyDoubleMode | null
  workingOn: string | null
  // Local handle (generated when entering looking). Kept in store so we can
  // display "you are X" in the active session.
  myHandle: string | null
  partner: BodyDoublePartner | null
  // Chat history of the active session. Cleared between sessions.
  chat: BodyDoubleChatMessage[]
  // Soft error/toast message — set on partner-left / connection-lost so the
  // UI can display "partner ended the session" without modal interruption.
  toast: string | null
}

interface Actions {
  startLooking: (mode: BodyDoubleMode, workingOn: string | null) => Promise<void>
  cancelLooking: () => Promise<void>
  sendChat: (text: string) => void
  endSession: () => Promise<void>
  dismissToast: () => void
  // Transition matched → connected once the user clicks "Start session"
  // after seeing the partner intro. Gives them a beat to read the partner
  // info before chat opens.
  enterConnected: () => void
}

export const usePeerBodyDoubleStore = create<State & Actions>((set, get) => ({
  status: 'idle',
  mode: null,
  workingOn: null,
  myHandle: null,
  partner: null,
  chat: [],
  toast: null,

  startLooking: async (mode, workingOn) => {
    if (get().status !== 'idle') return
    const handle = generateHandle()
    set({
      status: 'looking',
      mode,
      workingOn,
      myHandle: handle,
      partner: null,
      chat: [],
      toast: null
    })
    const m = getMatcher()
    await m.startLooking(
      { mode, workingOn, handle },
      {
        onPartnerMatched: (partner) => {
          set({ status: 'matched', partner })
        },
        onChatMessage: (msg) => {
          set({ chat: [...get().chat, msg] })
        },
        onPartnerLeft: () => {
          set({
            status: 'idle',
            partner: null,
            chat: [],
            toast: 'Your partner ended the session.'
          })
        }
      }
    )
  },

  cancelLooking: async () => {
    const m = getMatcher()
    await m.stopLooking()
    set({ status: 'idle', partner: null, chat: [], mode: null, workingOn: null })
  },

  enterConnected: () => {
    if (get().status !== 'matched') return
    set({ status: 'connected' })
  },

  sendChat: (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const handle = get().myHandle
    if (!handle) return
    if (get().status !== 'connected' && get().status !== 'matched') return
    const m = getMatcher()
    m.sendChat(trimmed)
    // Optimistic — show our own message immediately. The matcher only
    // echoes messages to the OTHER side; this is the local insertion so
    // the chat scroll reflects what we said.
    set({
      chat: [
        ...get().chat,
        {
          id: Math.random().toString(36).slice(2, 10),
          senderHandle: handle,
          text: trimmed,
          ts: Date.now()
        }
      ]
    })
  },

  endSession: async () => {
    const m = getMatcher()
    await m.endSession()
    set({
      status: 'idle',
      partner: null,
      chat: [],
      mode: null,
      workingOn: null
    })
  },

  dismissToast: () => set({ toast: null })
}))
