// Drives the per-widget AI setup preview. A menu action calls start(widgetId);
// the WidgetSetupPreview component (mounted once) runs the suggest IPC, shows
// the drafted items for approval, and applies the ticked ones in the widget's
// native format. This is the "tables-style AI setup, for every widget" flow.

import { create } from 'zustand'

interface WidgetSetupState {
  open: boolean
  widgetId: string | null
  start: (widgetId: string) => void
  close: () => void
}

export const useWidgetSetup = create<WidgetSetupState>((set) => ({
  open: false,
  widgetId: null,
  start: (widgetId) => set({ open: true, widgetId }),
  close: () => set({ open: false, widgetId: null })
}))
