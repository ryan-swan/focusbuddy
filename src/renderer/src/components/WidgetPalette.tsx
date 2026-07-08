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
  onBringSynced?: () => void
  disabled: boolean
  // compact=true renders a full-width row button instead of the accent chip,
  // for use inside the FloatingToolbar expanded panel.
  compact?: boolean
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
export default function WidgetPalette({
  onAdd,
  onImport,
  onBringSynced,
  disabled,
  compact = false
}: Props): JSX.Element {
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

  // Anchor the popover relative to the button. Portal it into document.body so
  // it escapes the toolbar's overflow/transform stacking context.
  //
  // Strategy: if the button is in the right half of the screen (e.g. the
  // FloatingToolbar), open the popover to the LEFT, vertically centered on the
  // button — this keeps it fully on-screen and in the center-right area.
  // Otherwise (button is left-side), open it below as before.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPopoverPos(null)
      return
    }
    const POPOVER_W = 340
    const POPOVER_MAX_H = Math.min(window.innerHeight * 0.6, 480)
    const r = buttonRef.current.getBoundingClientRect()
    const buttonCenterX = r.left + r.width / 2
    const buttonCenterY = r.top + r.height / 2

    let left: number
    let top: number

    if (buttonCenterX > window.innerWidth / 2) {
      // Button is on the right side — open popover to the LEFT
      left = Math.max(8, r.left - POPOVER_W - 8)
      // Vertically center the popover on the button, clamped to viewport
      top = Math.max(8, Math.min(
        buttonCenterY - POPOVER_MAX_H / 2,
        window.innerHeight - POPOVER_MAX_H - 8
      ))
    } else {
      // Button is on the left side — open below, clamped to viewport
      left = Math.min(Math.max(8, r.left), window.innerWidth - POPOVER_W - 8)
      top = Math.min(r.bottom + 6, window.innerHeight - 80)
    }

    setPopoverPos({ top, left })
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
        className={compact
          ? `w-full h-8 inline-flex items-center gap-2 rounded-xl px-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              open
                ? 'bg-[var(--surface-sunken)] text-[rgb(var(--accent))]'
                : 'text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)]'
            }`
          : `inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              open
                ? 'bg-accent/25 border-accent/60 text-accent'
                : 'bg-accent/10 border-accent/40 text-accent hover:bg-accent/20 hover:border-accent/60'
            }`
        }
        title="Add a widget to your desk"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="palette-add-button"
      >
        <Icon name={compact ? 'add_circle' : 'add'} size={compact ? 15 : 14} className="shrink-0" />
        <span className={compact ? 'text-[12px]' : ''}>
          {compact ? 'Add widget' : 'Widget'}
        </span>
      </button>
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[200] w-[340px] overflow-y-auto rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl"
          style={{ maxHeight: Math.min(window.innerHeight * 0.6, 480) }}
          style={{ top: popoverPos.top, left: popoverPos.left }}
          role="dialog"
          aria-label="Desk objects"
          data-widget-picker="true"
        >
          <div className="sticky top-0 bg-[var(--surface-raised)] px-3 py-2 border-b border-[var(--edge-soft)] flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold">
              Desk objects
            </span>
            <button
              onClick={() => setOpen(false)}
              className="h-5 w-5 inline-flex items-center justify-center text-[var(--ink-50)] hover:text-[var(--ink-100)]"
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
                  <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold mb-1.5">
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
                            className="relative flex flex-col items-center gap-1 px-2 py-2 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-sunken)] text-[var(--ink-40)] text-[10px] leading-tight cursor-pointer transition-colors hover:border-accent/40"
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
                          className="flex flex-col items-center gap-1 px-2 py-2 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-accent hover:bg-accent/5 dark:hover:bg-accent/10 text-[var(--ink-70)] text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-colors"
                          data-testid={`palette-add-${entry.kind}`}
                        >
                          <Icon name={entry.icon} size={18} className="text-[var(--ink-70)]" />
                          <span className="font-medium text-center">{entry.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {onBringSynced && (
              <div className="border-t border-[var(--edge-soft)] pt-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold mb-1.5">
                  From elsewhere
                </div>
                <button
                  onClick={() => {
                    onBringSynced()
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-accent hover:bg-accent/5 dark:hover:bg-accent/10 text-[var(--ink-70)] text-[11px]"
                  data-testid="palette-bring-synced"
                >
                  <Icon name="link" size={14} className="text-accent" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">Bring a synced widget…</div>
                    <div className="text-[9px] text-[var(--ink-50)]">
                      Live-linked copy from another task — edits mirror both ways
                    </div>
                  </div>
                </button>
              </div>
            )}
            {onImport && (
              <div className="border-t border-[var(--edge-soft)] pt-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold mb-1.5">
                  Import
                </div>
                <button
                  onClick={() => {
                    onImport()
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-accent hover:bg-accent/5 dark:hover:bg-accent/10 text-[var(--ink-70)] text-[11px]"
                  data-testid="palette-import-file"
                >
                  <Icon name="upload_file" size={14} className="text-[var(--ink-70)]" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">Import file…</div>
                    <div className="text-[9px] text-[var(--ink-50)]">
                      .txt / .md → note · .csv / .json → table
                    </div>
                  </div>
                </button>
              </div>
            )}
            <div className="text-[10px] text-[var(--ink-50)] leading-snug border-t border-[var(--edge-soft)] pt-2 -mb-1">
              Tip: drag any tile onto the canvas to place it where you want, or click to add at the centre.
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
