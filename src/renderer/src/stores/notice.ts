import { create } from 'zustand'

// DEC-091 — the house NOTICE toast: one transient, non-blocking line for
// "a thing happened somewhere you are not looking", with an optional action
// that takes you there. Born from demo item #14 (an AI-created document
// landed behind the front window and the operator could not find it) and
// reused by mail's sent-state. Deliberately NOT the UndoToast (that one is
// action history — its button reverses something) and NOT the
// CompletionToast (an offer awaiting a decision). A notice asserts a fact,
// offers a door, and leaves.

export interface Notice {
  text: string
  icon?: string
  action?: { label: string; run: () => void }
}

interface NoticeStore {
  notice: Notice | null
  /** Replaces any showing notice; auto-clears after ttlMs (default 6s). */
  show: (n: Notice, ttlMs?: number) => void
  clear: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null

export const useNoticeStore = create<NoticeStore>((set) => ({
  notice: null,
  show: (n, ttlMs = 6000) => {
    if (timer) clearTimeout(timer)
    set({ notice: n })
    timer = setTimeout(() => set({ notice: null }), ttlMs)
  },
  clear: () => {
    if (timer) clearTimeout(timer)
    timer = null
    set({ notice: null })
  }
}))
