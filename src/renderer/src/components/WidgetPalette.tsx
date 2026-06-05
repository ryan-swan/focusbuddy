import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CATEGORIES,
  DRAG_MIME,
  entriesByCategory,
  type WidgetCatalogEntry
} from '../lib/widgetCatalog'
import { canCreateWidget } from '../lib/gating'
import { useCapabilityStore } from '../stores/capabilities'
import { promptUpgrade } from '../stores/upgradePrompt'
import Icon from './Icon'

interface Props {
  onAdd: (entry: WidgetCatalogEntry) => void
  onImport?: () => void
  disabled: boolean
}

// Compact desk-objects picker.
//
// The previous design was a full-width horizontal strip pinned across the
// top of the canvas — at ~120px tall with 20+ chips, it routinely chewed
// 15-20% of vertical real estate even when collapsed. The new design is a
// single "+ Add" button in the toolbar that opens a portalled popover with
// the categorised chips. The popover closes on outside-click / Esc and is
// keyboard-friendly (Tab through chips, Enter to add). The picker itself
// is what shrank — what's IN it (the chips) is the same set, minus the
// redundant kinds we just folded into File.
export default function WidgetPalette({ onAdd, onImport, disabled }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      const inButton = buttonRef.current?.contains(e.target as Node)
      const inPopover = popoverRef.current?.contains(e.target as Node)
      if (!inButton && !inPopover) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', () => setOpen(false))
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Anchor the popover under the button. Portal it into document.body so it
  // escapes the toolbar's overflow/transform stacking context.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPopoverPos(null)
      return
    }
    const r = buttonRef.current.getBoundingClientRect()
    setPopoverPos({
      top: r.bottom + 6,
      left: Math.max(8, r.left)
    })
  }, [open])

  const grouped = entriesByCategory()
  // Live, admin-overridable capability map. A widget kind whose capability
  // resolves falsy for this user renders locked + opens the upgrade prompt
  // instead of creating. This is what makes the matrix gate the app.
  const caps = useCapabilityStore((s) => s.capabilities)

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`btn-ghost ${open ? 'bg-stone-200/70 dark:bg-stone-700/70' : ''}`}
        title="Add a desk object"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="palette-add-button"
      >
        <Icon name="add" size={14} />
        <span>Add</span>
      </button>
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[200] w-[340px] max-h-[60vh] overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl"
          style={{ top: popoverPos.top, left: popoverPos.left }}
          role="dialog"
          aria-label="Desk objects"
        >
          <div className="sticky top-0 bg-white dark:bg-stone-900 px-3 py-2 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold">
              Desk objects
            </span>
            <button
              onClick={() => setOpen(false)}
              className="h-5 w-5 inline-flex items-center justify-center text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
              aria-label="Close picker"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <div className="p-3 flex flex-col gap-3">
            {CATEGORIES.map((cat) => {
              const items = grouped[cat]
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <div className="text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400 font-semibold mb-1.5">
                    {cat}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((entry) => {
                      const locked = !canCreateWidget(caps, entry.kind)
                      if (locked) {
                        return (
                          <button
                            key={entry.kind}
                            title={`${entry.label} is a Pro feature — click to upgrade`}
                            onClick={() => {
                              promptUpgrade(`The ${entry.label} widget is a Pro feature.`)
                              setOpen(false)
                            }}
                            className="relative flex flex-col items-center gap-1 px-2 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 text-stone-400 dark:text-stone-500 text-[10px] leading-tight cursor-pointer transition-colors hover:border-accent/40"
                            data-testid={`palette-locked-${entry.kind}`}
                          >
                            <span className="absolute top-1 right-1 text-accent">
                              <Icon name="lock" size={10} />
                            </span>
                            <Icon name={entry.icon} size={18} className="opacity-50" />
                            <span className="font-medium text-center opacity-70">{entry.label}</span>
                          </button>
                        )
                      }
                      return (
                        <button
                          key={entry.kind}
                          title={entry.hint}
                          draggable
                          onClick={() => {
                            onAdd(entry)
                            setOpen(false)
                          }}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_MIME, entry.kind)
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          className="flex flex-col items-center gap-1 px-2 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-accent hover:bg-accent/5 dark:hover:bg-accent/10 text-stone-700 dark:text-stone-300 text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-colors"
                          data-testid={`palette-add-${entry.kind}`}
                        >
                          <Icon name={entry.icon} size={18} className="text-stone-600 dark:text-stone-400" />
                          <span className="font-medium text-center">{entry.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {onImport && (
              <div className="border-t border-stone-200 dark:border-stone-700 pt-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400 font-semibold mb-1.5">
                  Import
                </div>
                <button
                  onClick={() => {
                    onImport()
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-accent hover:bg-accent/5 dark:hover:bg-accent/10 text-stone-700 dark:text-stone-300 text-[11px]"
                  data-testid="palette-import-file"
                >
                  <Icon name="upload_file" size={14} className="text-stone-600 dark:text-stone-400" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">Import file…</div>
                    <div className="text-[9px] text-stone-500 dark:text-stone-400">
                      .txt / .md → note · .csv / .json → table
                    </div>
                  </div>
                </button>
              </div>
            )}
            <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug border-t border-stone-200 dark:border-stone-700 pt-2 -mb-1">
              Tip: drag any tile onto the canvas to place it where you want, or click to add at the centre.
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
