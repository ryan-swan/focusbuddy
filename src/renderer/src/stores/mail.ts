import { create } from 'zustand'
import type {
  MailAccountInput,
  MailAccountPublic,
  MailListItem,
  MailFullMessage
} from '@shared/types'

// Mail store — the IMAP inbox the user connects with their own mailbox. All
// the IMAP work happens in the main process; this store holds the account
// status, the message list (envelope only), and the one open message body, and
// it drives both the dedicated Mail view and the email rows in the unified
// Inbox feed.

interface MailStore {
  account: MailAccountPublic | null
  loadedAccount: boolean
  messages: MailListItem[]
  open: MailFullMessage | null
  openUid: number | null
  loadingList: boolean
  loadingOpen: boolean
  error: string | null

  loadAccount: () => Promise<void>
  saveAccount: (config: MailAccountInput) => Promise<{ ok: boolean; error?: string }>
  testAccount: (config: MailAccountInput) => Promise<{ ok: boolean; error?: string }>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
  openMessage: (uid: number) => Promise<void>
  closeMessage: () => void
}

/** Count of unread messages in the current list — a derived selector. */
export const selectMailUnread = (s: MailStore): number =>
  s.messages.filter((m) => !m.seen).length

export const useMailStore = create<MailStore>((set, get) => ({
  account: null,
  loadedAccount: false,
  messages: [],
  open: null,
  openUid: null,
  loadingList: false,
  loadingOpen: false,
  error: null,

  loadAccount: async () => {
    const account = await window.api.mail.getAccount()
    set({ account: account.configured ? account : null, loadedAccount: true })
    if (account.configured) void get().refresh()
  },

  saveAccount: async (config) => {
    const r = await window.api.mail.saveAccount(config)
    if (!r.ok) {
      set({ error: r.error })
      return { ok: false, error: r.error }
    }
    set({ account: r.account, error: null })
    void get().refresh()
    return { ok: true }
  },

  testAccount: async (config) => {
    const r = await window.api.mail.testAccount(config)
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  },

  disconnect: async () => {
    await window.api.mail.clearAccount()
    set({ account: null, messages: [], open: null, openUid: null, error: null })
  },

  refresh: async () => {
    if (!get().account) return
    set({ loadingList: true, error: null })
    const r = await window.api.mail.list(40)
    if (!r.ok) {
      set({ loadingList: false, error: r.error })
      return
    }
    set({ messages: r.items, loadingList: false })
  },

  openMessage: async (uid) => {
    set({ loadingOpen: true, openUid: uid, error: null })
    const r = await window.api.mail.get(uid)
    if (!r.ok) {
      set({ loadingOpen: false, error: r.error })
      return
    }
    set({ open: r.message, loadingOpen: false })
    // Reflect the read state locally and on the server.
    set((s) => ({
      messages: s.messages.map((m) => (m.uid === uid ? { ...m, seen: true } : m))
    }))
    void window.api.mail.markSeen(uid)
  },

  closeMessage: () => set({ open: null, openUid: null })
}))
