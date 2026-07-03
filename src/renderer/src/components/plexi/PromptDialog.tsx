import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

// Shared inline prompt dialog — the replacement for window.prompt, which
// Electron does not implement (it returns null without showing anything, so
// every menu item that relied on it silently did nothing; see the e2e notes in
// livingDocWidget.spec.ts). Call promptText(...) from any handler and await the
// answer; PromptDialogHost must be mounted once per renderer root (App.tsx and
// PlexiOfficeApp.tsx both mount it).
//
// The dialog carries proper dialog semantics: role, aria-modal, labelled title,
// initial focus on the input, a Tab trap inside the panel, Escape to cancel and
// Enter to confirm. It intentionally styles like the rest of the suite rather
// than the OS-native chrome the old confirm/prompt calls produced.

export interface PromptRequest {
  title: string
  /** One quiet helper line under the title, when the title alone is ambiguous. */
  label?: string
  initial?: string
  placeholder?: string
  confirmLabel?: string
  /** Textarea instead of a single-line input (e.g. paste-JSON flows). */
  multiline?: boolean
  /** Pre-select the initial text so typing replaces it (renames). Default true. */
  selectAll?: boolean
  /** Confirm mode: no input field; resolves 'yes' or null. Set by confirmDialog. */
  confirmOnly?: boolean
  /** Styles the confirm button red for destructive confirms. */
  danger?: boolean
}

interface PromptState {
  req: PromptRequest | null
  resolve: ((value: string | null) => void) | null
  open: (req: PromptRequest, resolve: (value: string | null) => void) => void
  settle: (value: string | null) => void
}

const usePromptStore = create<PromptState>((set, get) => ({
  req: null,
  resolve: null,
  open: (req, resolve) => {
    // A second prompt while one is open cancels the first rather than stacking.
    get().resolve?.(null)
    set({ req, resolve })
  },
  settle: (value) => {
    get().resolve?.(value)
    set({ req: null, resolve: null })
  }
}))

/**
 * Ask the user for one line (or block) of text. Resolves with the entered
 * string, or null when they cancel — the same contract window.prompt had, so
 * call sites port mechanically:  `const v = await promptText({ title: '…' })`.
 */
export function promptText(req: PromptRequest): Promise<string | null> {
  return new Promise((resolve) => usePromptStore.getState().open(req, resolve))
}

/**
 * Styled in-app replacement for window.confirm on destructive actions: same
 * design language as the rest of the suite instead of OS-native chrome.
 * Resolves true when confirmed.
 */
export function confirmDialog(req: {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return promptText({
    title: req.title,
    label: req.body,
    confirmLabel: req.confirmLabel ?? 'Confirm',
    confirmOnly: true,
    danger: req.danger
  }).then((v) => v !== null)
}

/**
 * Show text for the user to copy by hand — the fallback when the clipboard API
 * fails. Replaces the old `window.prompt('Copy this…', text)` idiom.
 */
export function showCopyFallback(title: string, text: string): Promise<void> {
  return promptText({ title, initial: text, confirmLabel: 'Done', selectAll: true }).then(() => {})
}

export function PromptDialogHost(): JSX.Element | null {
  const req = usePromptStore((s) => s.req)
  const settle = usePromptStore((s) => s.settle)
  const [value, setValue] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Reset the draft each time a new request arrives.
  useEffect(() => {
    setValue(req?.initial ?? '')
  }, [req])

  // Initial focus (with optional select-all) once the field exists. Confirm
  // mode has no field, so the panel itself takes focus for Enter/Escape.
  useEffect(() => {
    if (!req) return
    if (req.confirmOnly) {
      panelRef.current?.focus()
      return
    }
    const el = fieldRef.current
    if (!el) return
    el.focus()
    if (req.selectAll !== false && 'select' in el) el.select()
  }, [req])

  if (!req) return null

  const confirm = (): void => settle(value)
  const cancel = (): void => settle(null)

  // Keep Tab cycling inside the panel — the minimal focus trap. The panel is
  // small (field + two buttons), so querying focusables on each keydown is fine.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      cancel()
      return
    }
    if (e.key === 'Enter' && !(req.multiline && !e.metaKey && !e.ctrlKey)) {
      // Single-line: Enter confirms. Multiline: Cmd/Ctrl+Enter confirms.
      e.preventDefault()
      confirm()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = panel.querySelectorAll<HTMLElement>('input, textarea, button')
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
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onMouseDown={cancel}
      data-testid="prompt-dialog-overlay"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={req.title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-[min(440px,90vw)] rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-stone-900 shadow-2xl p-4"
        data-testid="prompt-dialog"
      >
        <div className="text-[14px] font-semibold text-stone-900 dark:text-stone-100">{req.title}</div>
        {req.label && <div className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">{req.label}</div>}
        {req.confirmOnly ? null : req.multiline ? (
          <textarea
            ref={(el) => (fieldRef.current = el)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.placeholder}
            rows={6}
            className="mt-3 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-accent resize-y"
            data-testid="prompt-dialog-input"
          />
        ) : (
          <input
            ref={(el) => (fieldRef.current = el)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.placeholder}
            className="mt-3 w-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
            data-testid="prompt-dialog-input"
          />
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={cancel}
            className="px-3 py-1.5 rounded-lg text-[13px] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className={
              req.danger
                ? 'px-3 py-1.5 rounded-lg text-[13px] font-medium bg-red-600 text-white hover:bg-red-700'
                : 'btn-primary'
            }
            data-testid="prompt-dialog-confirm"
          >
            {req.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
