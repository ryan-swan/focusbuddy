import { useEffect } from 'react'
import { useViewStore } from '../stores/view'
import Icon from './Icon'

// The true back button. The view store has always kept full past/future
// history stacks (every navigation funnels through commit()), but only the
// desk canvas ever consumed them. These are the global controls: browser-grade
// back/forward in the titlebar, ⌘←/⌘→, and the mouse back/forward buttons.

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useHistoryKeys(): void {
  const back = useViewStore((s) => s.back)
  const forward = useViewStore((s) => s.forward)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // ⌘←/⌘→ are line-start/line-end inside any editor — never steal them.
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.defaultPrevented || isEditableTarget(e.target)) return
      e.preventDefault()
      if (e.key === 'ArrowLeft') back()
      else forward()
    }
    // Mouse back/forward (buttons 3/4) — the muscle memory every browser honors.
    function onMouse(e: MouseEvent): void {
      if (e.button === 3) {
        e.preventDefault()
        back()
      } else if (e.button === 4) {
        e.preventDefault()
        forward()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [back, forward])
}

export default function HistoryNav(): JSX.Element {
  const canBack = useViewStore((s) => s.past.length > 0)
  const canForward = useViewStore((s) => s.future.length > 0)
  const back = useViewStore((s) => s.back)
  const forward = useViewStore((s) => s.forward)

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={back}
        disabled={!canBack}
        aria-label="Back"
        title="Back (⌘←)"
        data-testid="history-back"
        className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <Icon name="arrow_back" size={16} />
      </button>
      <button
        onClick={forward}
        disabled={!canForward}
        aria-label="Forward"
        title="Forward (⌘→)"
        data-testid="history-forward"
        className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <Icon name="arrow_forward" size={16} />
      </button>
    </div>
  )
}
