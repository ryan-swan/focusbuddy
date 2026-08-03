import { useEffect, useState } from 'react'
import { useViewStore } from '../stores/view'

// Live width of the desk sidebar dock ([data-testid="sidebar-dock"]), measured
// from the rendered element (Phase 3a.4, P6). The dock's width/minimised hooks
// (useSidebarWidth / useMinimizable) are per-instance local state — a second
// hook instance here would read the persisted value once and go stale the
// moment the user drags the grip or minimises. Measuring the DOM is the honest
// source: it tracks resize live (ResizeObserver), the minimised 58px strip,
// and absence (segment takeovers render no dock → 0).
export function useSidebarDockInset(enabled: boolean): number {
  // Re-acquire the element whenever the view changes — the dock unmounts on
  // takeover screens and remounts on the way back.
  const viewKind = useViewStore((s) => s.view.kind)
  const [inset, setInset] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setInset(0)
      return
    }
    const el = document.querySelector('[data-testid="sidebar-dock"]')
    if (!(el instanceof HTMLElement)) {
      setInset(0)
      return
    }
    const update = (): void => setInset(Math.round(el.getBoundingClientRect().width))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled, viewKind])
  return inset
}
