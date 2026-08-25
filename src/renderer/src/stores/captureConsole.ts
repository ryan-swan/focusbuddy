import { create } from 'zustand'

// The capture console's open/close state (Attention S5). Opened by the
// fb:command-new-work-item seam (palette, shortcuts, future surfaces) with
// optional prefill text; the console itself lives in App so it floats over
// every view.

interface CaptureConsoleStore {
  open: boolean
  initialText: string
  openConsole: (initialText?: string) => void
  close: () => void
}

export const useCaptureConsole = create<CaptureConsoleStore>((set) => ({
  open: false,
  initialText: '',
  openConsole: (initialText = '') => set({ open: true, initialText }),
  close: () => set({ open: false, initialText: '' })
}))
