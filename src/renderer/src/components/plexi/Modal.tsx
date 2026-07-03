import { useEffect, useRef, type ReactNode } from 'react'

// Shared modal wrapper — the accessibility shell every hand-rolled overlay
// should adopt. It renders the backdrop, gives the panel proper dialog
// semantics (role, aria-modal, an accessible name), moves focus into the panel
// on open and restores it to the previously-focused element on close, traps Tab
// inside the panel, and closes on Escape and on a backdrop click. This is the
// same behaviour PromptDialog implements inline, lifted so the ~10 remaining
// bespoke modals stop each reinventing (and mostly omitting) it.
//
// It wraps EXISTING panel markup: pass the panel content as children and the
// wrapper supplies only the outer overlay + panel container semantics, so
// migrating a modal is moving its inner JSX inside <Modal> and deleting the
// old hand-rolled backdrop/panel divs, not a rewrite.

export interface ModalProps {
  onClose: () => void
  // Accessible name for the dialog. Provide either this or labelledById.
  label?: string
  labelledById?: string
  children: ReactNode
  // Extra classes for the panel container (width, padding, max-height, etc.).
  className?: string
  // z-index layer. Defaults to 200 (above chrome, below the prompt/confirm
  // dialog at 300 so a confirm raised from within a modal sits on top).
  z?: number
  // Set false for modals that should not close on a backdrop click (rare).
  closeOnBackdrop?: boolean
  // Optional testid on the panel for e2e.
  testId?: string
}

export default function Modal({
  onClose,
  label,
  labelledById,
  children,
  className = '',
  z = 200,
  closeOnBackdrop = true,
  testId
}: ModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // Remember what had focus, move focus into the panel, restore on unmount.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) {
      const first = panel.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
      )
      ;(first ?? panel).focus()
    }
    return () => {
      // Only restore if focus is still inside the (now-unmounting) panel, so we
      // don't yank focus away from wherever the user has since moved it.
      if (restoreRef.current && document.body.contains(restoreRef.current)) {
        restoreRef.current.focus()
      }
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      style={{ zIndex: z }}
      onMouseDown={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledById}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className={className || 'outline-none'}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  )
}
