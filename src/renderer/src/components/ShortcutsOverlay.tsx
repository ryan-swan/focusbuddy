import { useEffect, useRef, useState } from 'react'
import type { WidgetKind } from '@shared/types'
import { WIDGET_CATALOG, WIDGET_SHORTCUTS } from '../lib/widgetCatalog'
import { effectiveQuickAddMap, useKeymap } from '../lib/keymap'
import Icon from './Icon'

// Global keyboard-shortcuts reference, opened with Cmd+/ from anywhere (the
// document editors additionally have their own editor-scoped panel under the
// same key, listing per-editor commands). Until this existed, the app-wide
// bindings — Cmd+K vs Cmd+Shift+K, the structural undo scope, the single-letter
// canvas quick-adds — were documented nowhere in the UI; a power user had to
// discover them by accident. The canvas quick-add rows are generated from
// WIDGET_SHORTCUTS/WIDGET_CATALOG so this panel can never drift from the real
// bindings.

interface Row {
  keys: string
  label: string
}

const GLOBAL_ROWS: Row[] = [
  { keys: '⌘K', label: 'Search everything (palette): navigate, find content, run commands' },
  { keys: '⌘⇧K', label: 'Ask AI: describe what to build or change, approve its proposals' },
  { keys: '⌘Z / ⌘⇧Z', label: 'Undo / redo structural actions (create, delete, move, rename). Text fields and the doc, sheet and slides editors keep their own per-character undo.' },
  { keys: '⌘/', label: 'This panel' },
  { keys: 'Esc', label: 'Close dialogs and menus; on the canvas, deselect' }
]

const CANVAS_ROWS: Row[] = [
  { keys: '⌘] / ⌘[', label: 'Zoom in / out' },
  { keys: '⌘0', label: 'Reset the view' },
  { keys: '⌘H', label: 'Centre on home' },
  { keys: '⌘A', label: 'Select all widgets' }
]

// The quick-add section is editable: click a key chip, press a new letter to
// rebind it (Backspace disables, Escape cancels). Overrides persist locally
// via useKeymap; Reset restores the defaults.
function QuickAddEditor(): JSX.Element {
  const overrides = useKeymap((s) => s.overrides)
  const setKey = useKeymap((s) => s.setKey)
  const reset = useKeymap((s) => s.reset)
  const [capturing, setCapturing] = useState<WidgetKind | null>(null)
  const map = effectiveQuickAddMap()
  void overrides // subscribe so edits re-render

  useEffect(() => {
    if (!capturing) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setKey(capturing!, '') // disable this quick-add
        setCapturing(null)
        return
      }
      if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setKey(capturing!, e.key.toUpperCase())
        setCapturing(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, setKey])

  const kinds = WIDGET_CATALOG.filter((e) => e.kind in WIDGET_SHORTCUTS)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold">
          Canvas quick-add (single letter, when not typing) — click a key to rebind
        </div>
        <button onClick={reset} className="text-[11px] text-stone-400 hover:text-accent">
          Reset to defaults
        </button>
      </div>
      <div className="space-y-1">
        {kinds.map((entry) => {
          const key = map[entry.kind]
          const active = capturing === entry.kind
          return (
            <div key={entry.kind} className="flex items-baseline gap-3">
              <button
                onClick={() => setCapturing(active ? null : entry.kind)}
                className={`shrink-0 min-w-[64px] text-center px-1.5 py-0.5 rounded border text-[11px] font-mono ${
                  active
                    ? 'border-accent text-accent bg-accent/10 animate-pulse'
                    : 'border-stone-300 dark:border-stone-600 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:border-accent'
                }`}
                data-testid={`rebind-${entry.kind}`}
              >
                {active ? 'press key…' : (key ?? 'off')}
              </button>
              <span className="text-[12.5px] text-stone-700 dark:text-stone-300 leading-relaxed">
                Add {entry.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }): JSX.Element {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold mb-1.5">
        {title}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.keys + r.label} className="flex items-baseline gap-3">
            <kbd className="shrink-0 min-w-[64px] text-center px-1.5 py-0.5 rounded border border-stone-300 dark:border-stone-600 bg-stone-100 dark:bg-stone-800 text-[11px] font-mono text-stone-700 dark:text-stone-200">
              {r.keys}
            </kbd>
            <span className="text-[12.5px] text-stone-700 dark:text-stone-300 leading-relaxed">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-[290] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onMouseDown={onClose}
      data-testid="shortcuts-overlay"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        className="w-[min(640px,92vw)] max-h-[80vh] overflow-auto rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-stone-900 shadow-2xl p-5 focus:outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="keyboard" size={18} className="text-accent" />
            <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-100">Keyboard shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <Section title="Everywhere" rows={GLOBAL_ROWS} />
          <Section title="On the canvas" rows={CANVAS_ROWS} />
          <div className="sm:col-span-2">
            <QuickAddEditor />
          </div>
        </div>
        <p className="mt-4 text-[11px] text-stone-500 dark:text-stone-400">
          Inside a document, spreadsheet or deck, this key shows that editor's own commands instead.
        </p>
      </div>
    </div>
  )
}
