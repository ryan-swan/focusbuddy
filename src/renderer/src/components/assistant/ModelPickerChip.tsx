import { useEffect, useRef, useState } from 'react'
import { MODEL_OPTIONS, useModelMode } from '../../lib/modelPrefs'
import Icon from '../Icon'

// The composer's model picker (P7), extracted so the assistant panel and the
// focus AI Chat render the identical control. Same MODEL_OPTIONS data and the
// same shared preference as the Settings picker — every instance is a door to
// ONE switch (modelPrefs' module-level subscriber keeps them in live sync),
// never a second switch. Opens upward: every composer sits at the bottom of
// its surface.
export default function ModelPickerChip(): JSX.Element {
  const [modelMode, setModelMode] = useModelMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])
  const active = MODEL_OPTIONS.find((o) => o.value === modelMode) ?? MODEL_OPTIONS[0]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="composer-model-toggle"
        aria-label="Choose model"
        aria-expanded={open}
        title={`Model — ${active.label}. ${active.blurb}`}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--edge-soft)] px-2 py-0.5 text-[10px] font-mono text-[var(--ink-60)] hover:border-[rgb(var(--accent)/0.5)] hover:text-[var(--ink-90)] transition-colors"
      >
        <Icon name="psychology" size={11} className="shrink-0" />
        <span className="truncate max-w-[110px]">{active.label}</span>
        <Icon name="unfold_more" size={10} className="shrink-0" />
      </button>
      {open && (
        <div
          data-testid="composer-model-menu"
          className="absolute left-0 bottom-full mb-1.5 z-30 w-[300px] rounded-[var(--radius-row)] border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-1"
          style={{ boxShadow: 'var(--shadow-cast)' }}
        >
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-testid={`composer-model-${opt.value}`}
              onClick={() => {
                setModelMode(opt.value)
                setOpen(false)
              }}
              className="w-full flex items-start gap-2 rounded-[var(--radius-chip)] px-2 py-1.5 text-left hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <span className="w-8 shrink-0 pt-0.5 text-[10px] font-mono text-[var(--ink-40)]">
                {opt.costTier}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[var(--ink-90)]">{opt.label}</span>
                <span className="block text-[10.5px] text-[var(--ink-50)] leading-snug">
                  {opt.blurb}
                </span>
              </span>
              {opt.value === modelMode && (
                <Icon name="check" size={14} className="text-accent shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
