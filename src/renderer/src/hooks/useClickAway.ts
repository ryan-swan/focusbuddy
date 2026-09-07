import { useEffect, type RefObject } from 'react'

/**
 * DEC-126 — a popover that closes when the pointer lands anywhere outside it,
 * or on Escape. The house pattern (SettingsPanel, ThemeBuilder), extracted so
 * every small menu in a message row behaves the same way.
 *
 * Armed a beat after opening, so the click that opened it can never also
 * close it; listens on mousedown, so the outside target's own click still
 * lands (a click on another row's door opens that door in the same gesture).
 * Pass a stable `onAway` (useCallback) — the listener re-arms when it changes.
 */
export function useClickAway(ref: RefObject<HTMLElement | null>, active: boolean, onAway: () => void): void {
  useEffect(() => {
    if (!active) return
    function onDown(e: MouseEvent): void {
      const target = e.target as Node | null
      if (target && ref.current?.contains(target)) return
      onAway()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onAway()
    }
    const armId = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
    }, 50)
    return () => {
      window.clearTimeout(armId)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ref, active, onAway])
}
