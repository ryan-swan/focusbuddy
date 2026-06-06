import { useEffect, useRef, useState } from 'react'
import {
  ACCENT_OPTIONS,
  FONT_OPTIONS,
  THEME_OPTIONS,
  isValidHex,
  type AccentColor,
  type FontChoice,
  type ThemeMode
} from '../lib/theme'
import { captureRitualOrigin, playThemeRitual } from '../lib/themeRitual'
import Icon from './Icon'

interface Props {
  mode: ThemeMode
  accent: AccentColor
  font: FontChoice
  customAccentHex: string
  onModeChange: (m: ThemeMode) => void
  onAccentChange: (a: AccentColor) => void
  onFontChange: (f: FontChoice) => void
  onCustomAccentChange: (hex: string) => void
  onClose: () => void
}

// Theme studio — the "make it yours" surface. Everything here is free for every
// tier; it's about personalisation and legibility, not a paywalled cosmetic.
// Three controls: the base theme (reusing the presets), a custom accent colour
// (any hex, with a live derived hover), and the interface font (a curated set
// of accessibility-first faces). All changes apply live to the whole app.
export default function ThemeBuilder({
  mode,
  accent,
  font,
  customAccentHex,
  onModeChange,
  onAccentChange,
  onFontChange,
  onCustomAccentChange,
  onClose
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  // Local text mirror of the hex so typing an in-progress value (e.g. "#7c3")
  // doesn't immediately clobber the live colour until it's a valid 6-digit hex.
  const [hexText, setHexText] = useState(customAccentHex)

  useEffect(() => {
    setHexText(customAccentHex)
  }, [customAccentHex])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    function onClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    const armId = window.setTimeout(() => window.addEventListener('mousedown', onClickOutside), 50)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClickOutside)
      window.clearTimeout(armId)
    }
  }, [onClose])

  const customActive = accent === 'custom'

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        ref={ref}
        className="w-full max-w-md max-h-[86vh] overflow-y-auto rounded-xl fb-glass-pillow border border-[color:var(--glass-pillow-border)] bg-stone-50/95 dark:bg-stone-900/95"
        data-testid="theme-builder"
      >
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-50/90 dark:bg-stone-900/90 backdrop-blur flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="palette" size={18} className="text-accent" />
            <div>
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Theme studio
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">
                Free for everyone. Changes apply live.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close theme studio">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Base theme */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold mb-2">
              Base theme
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {THEME_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={(e) => {
                    if (o.value === mode) return
                    captureRitualOrigin(e)
                    playThemeRitual(() => onModeChange(o.value))
                  }}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] transition-colors ${
                    mode === o.value
                      ? 'border-accent bg-accent/10 text-stone-900 dark:text-stone-100'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                  data-testid={`themestudio-mode-${o.value}`}
                >
                  <Icon
                    name={o.icon}
                    size={16}
                    className={
                      mode === o.value ? 'text-accent' : 'text-stone-500 dark:text-stone-400'
                    }
                  />
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
            {mode === 'atelier' && (
              <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1.5 leading-snug">
                Atelier locks its heritage-gold accent for cohesion. Switch to another base
                theme to use a custom accent.
              </p>
            )}
          </section>

          {/* Accent */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold mb-2">
              Accent colour
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              {ACCENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={(e) => {
                    if (o.value === accent) return
                    captureRitualOrigin(e)
                    playThemeRitual(() => onAccentChange(o.value))
                  }}
                  title={o.label}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-colors ${
                    accent === o.value
                      ? 'border-stone-700 dark:border-stone-300 bg-stone-100 dark:bg-stone-700'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                  data-testid={`themestudio-accent-${o.value}`}
                >
                  <span
                    className="h-5 w-5 rounded-full border-2 border-white dark:border-stone-900 shadow"
                    style={{ backgroundColor: o.preview }}
                  />
                  <span className="text-[10px] text-stone-600 dark:text-stone-400">{o.label}</span>
                </button>
              ))}
            </div>

            {/* Custom colour */}
            <div
              className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                customActive
                  ? 'border-accent bg-accent/[0.06]'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800'
              }`}
            >
              <label
                className="relative h-9 w-9 rounded-md overflow-hidden border border-stone-300 dark:border-stone-600 cursor-pointer shrink-0"
                title="Pick any colour"
              >
                <span
                  className="absolute inset-0"
                  style={{ backgroundColor: isValidHex(hexText) ? hexText : customAccentHex }}
                />
                <input
                  type="color"
                  value={isValidHex(hexText) ? hexText : customAccentHex}
                  onChange={(e) => {
                    setHexText(e.target.value)
                    onCustomAccentChange(e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  data-testid="themestudio-custom-color"
                  aria-label="Custom accent colour picker"
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                  Custom colour
                </div>
                <input
                  type="text"
                  value={hexText}
                  spellCheck={false}
                  onChange={(e) => {
                    const next = e.target.value
                    setHexText(next)
                    if (isValidHex(next)) onCustomAccentChange(next)
                  }}
                  placeholder="#7c3aed"
                  className="mt-0.5 w-28 px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-[11px] font-mono text-stone-700 dark:text-stone-300 focus:outline-none focus:border-accent"
                  data-testid="themestudio-custom-hex"
                />
              </div>
              {customActive && (
                <span className="inline-flex items-center gap-1 text-[10px] text-accent shrink-0">
                  <Icon name="check_circle" size={13} filled />
                  Active
                </span>
              )}
            </div>
          </section>

          {/* Font */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold mb-2">
              Interface font
            </div>
            <div className="space-y-1.5">
              {FONT_OPTIONS.map((o) => {
                const active = font === o.value
                return (
                  <button
                    key={o.value}
                    onClick={() => onFontChange(o.value)}
                    className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                      active
                        ? 'border-accent bg-accent/[0.06]'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700'
                    }`}
                    data-testid={`themestudio-font-${o.value}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-semibold text-stone-900 dark:text-stone-100"
                        style={{ fontFamily: o.stack }}
                      >
                        {o.label}
                      </span>
                      {active && (
                        <Icon name="check_circle" size={15} filled className="text-accent" />
                      )}
                    </div>
                    <div
                      className="text-[15px] text-stone-700 dark:text-stone-300 mt-0.5"
                      style={{ fontFamily: o.stack }}
                    >
                      The quick brown fox jumps over 1,234
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1 leading-snug">
                      {o.note}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
