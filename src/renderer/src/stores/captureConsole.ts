import { create } from 'zustand'

// The capture console's open/close state (Attention S5). Opened by the
// fb:command-new-work-item seam (palette, shortcuts, future surfaces) with
// optional prefill text; the console itself lives in App so it floats over
// every view.

// CR-09 D-A: a capture opened by MARKING an object carries where it came from
// (sourceType/sourceRef ride the S2 manifest) and the class its preset picked,
// so the confirm card opens already pointing at the right thing.
export interface CaptureSource {
  sourceType: string
  sourceRef: string
  /** Pre-picked class from the preset table; the card can still flip it. */
  intentClass?: string
  /** DEC-091 — the URL a browser widget was AT when the mark was made (the
   *  Slack message view, the doc, the ticket). Stored on the item as
   *  source_url so the queue can deep-link back to the exact page, not just
   *  the widget — which may have navigated away since. */
  sourceUrl?: string | null
  /** The desk the object lives on, so the item parents correctly. */
  deskId?: string | null
  deskTitle?: string | null
}

interface CaptureConsoleStore {
  open: boolean
  initialText: string
  /** DEC-044: pre-seeded notes — a marked SELECTION arrives with its full
   *  highlighted text here, so nothing the operator highlighted is dropped. */
  initialNotes: string
  source: CaptureSource | null
  openConsole: (initialText?: string, source?: CaptureSource | null, initialNotes?: string) => void
  close: () => void
}

export const useCaptureConsole = create<CaptureConsoleStore>((set) => ({
  open: false,
  initialText: '',
  initialNotes: '',
  source: null,
  openConsole: (initialText = '', source = null, initialNotes = '') =>
    set({ open: true, initialText, source, initialNotes }),
  close: () => set({ open: false, initialText: '', initialNotes: '', source: null })
}))
