import { useEffect, useRef, useState } from 'react'
import {
  ACCENT_OPTIONS,
  FONT_OPTIONS,
  THEME_OPTIONS,
  isValidHex,
  type AccentColor,
  type DeskBgMode,
  type FontChoice,
  type ThemeCustomization,
  type ThemeMode
} from '../lib/theme'
import { captureRitualOrigin, playThemeRitual } from '../lib/themeRitual'
import {
  UI_SCALES,
  loadUiScale,
  saveUiScale,
  applyUiScale,
  loadDensity,
  saveDensity,
  applyDensity,
  type Density
} from '../lib/uiScale'
import Icon from './Icon'

interface Props {
  mode: ThemeMode
  accent: AccentColor
  font: FontChoice
  customAccentHex: string
  customization: ThemeCustomization
  onModeChange: (m: ThemeMode) => void
  onAccentChange: (a: AccentColor) => void
  onFontChange: (f: FontChoice) => void
  onCustomAccentChange: (hex: string) => void
  onCustomizationChange: (patch: Partial<ThemeCustomization>) => void
  onResetCustomization: () => void
  onClose: () => void
}

const ICON_WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 700, label: 'Bold' }
]

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
  customization,
  onModeChange,
  onAccentChange,
  onFontChange,
  onCustomAccentChange,
  onCustomizationChange,
  onResetCustomization,
  onClose
}: Props): JSX.Element {
  const c = customization
  const ref = useRef<HTMLDivElement | null>(null)
  // Local text mirror of the hex so typing an in-progress value (e.g. "#7c3")
  // doesn't immediately clobber the live colour until it's a valid 6-digit hex.
  const [hexText, setHexText] = useState(customAccentHex)
  const [uiScale, setUiScale] = useState(loadUiScale())
  const [density, setDensity] = useState<Density>(loadDensity())

  useEffect(() => {
    setHexText(customAccentHex)
  }, [customAccentHex])

  // Keep the scale control in step when the View menu or the Cmd +/-/0 shortcuts
  // change the scale while this panel is open.
  useEffect(() => {
    function onScale(e: Event): void {
      const detail = (e as CustomEvent<number>).detail
      if (typeof detail === 'number') setUiScale(detail)
    }
    window.addEventListener('plexi:uiscale', onScale)
    return () => window.removeEventListener('plexi:uiscale', onScale)
  }, [])

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
        className="w-full max-w-md max-h-[86vh] overflow-y-auto rounded-xl fb-glass-pillow border border-[color:var(--glass-pillow-border)] bg-[var(--surface-sunken)]/95"
        data-testid="theme-builder"
      >
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]/90 backdrop-blur flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="palette" size={18} className="text-accent" />
            <div>
              <div className="text-sm font-semibold text-[var(--ink-100)]">
                Theme studio
              </div>
              <div className="text-[10px] text-[var(--ink-50)]">
                Free for everyone. Changes apply live.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onResetCustomization}
              className="text-[10px] px-2 py-1 rounded border border-[var(--edge-soft)] text-[var(--ink-50)] hover:bg-[var(--surface-sunken)]"
              data-testid="themestudio-reset"
              title="Reset background, glass and icon customisations to default"
            >
              Reset
            </button>
            <button onClick={onClose} className="icon-btn" aria-label="Close theme studio">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Base theme */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
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
                      ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                      : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                  }`}
                  data-testid={`themestudio-mode-${o.value}`}
                >
                  <Icon
                    name={o.icon}
                    size={16}
                    className={
                      mode === o.value ? 'text-accent' : 'text-[var(--ink-50)]'
                    }
                  />
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
            {mode === 'atelier' && (
              <p className="text-[10px] text-[var(--ink-50)] mt-1.5 leading-snug">
                Atelier locks its heritage-gold accent for cohesion. Switch to another base
                theme to use a custom accent.
              </p>
            )}
            {mode === 'gemstone' && (
              <p className="text-[10px] text-[var(--ink-50)] mt-1.5 leading-snug">
                Gemstone re-tints its sparkle and refraction to your accent. The Emerald, Ruby
                and Sapphire accents below are tuned to it.
              </p>
            )}
          </section>

          {/* Accent */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
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
                      ? 'border-stone-700 dark:border-stone-300 bg-[var(--surface-sunken)]'
                      : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)]'
                  }`}
                  data-testid={`themestudio-accent-${o.value}`}
                >
                  <span
                    className="h-5 w-5 rounded-full border-2 border-white dark:border-stone-900 shadow"
                    style={{ backgroundColor: o.preview }}
                  />
                  <span className="text-[10px] text-[var(--ink-70)]">{o.label}</span>
                </button>
              ))}
            </div>

            {/* Custom colour */}
            <div
              className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                customActive
                  ? 'border-accent bg-accent/[0.06]'
                  : 'border-[var(--edge-soft)] bg-[var(--surface-raised)]'
              }`}
            >
              <label
                className="relative h-9 w-9 rounded-md overflow-hidden border border-[var(--edge-firm)] cursor-pointer shrink-0"
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
                <div className="text-xs font-medium text-[var(--ink-90)]">
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
                  className="mt-0.5 w-28 px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--edge-soft)] text-[11px] font-mono text-[var(--ink-70)] focus:outline-none focus:border-accent"
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
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
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
                        : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`themestudio-font-${o.value}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-semibold text-[var(--ink-100)]"
                        style={{ fontFamily: o.stack }}
                      >
                        {o.label}
                      </span>
                      {active && (
                        <Icon name="check_circle" size={15} filled className="text-accent" />
                      )}
                    </div>
                    <div
                      className="text-[15px] text-[var(--ink-70)] mt-0.5"
                      style={{ fontFamily: o.stack }}
                    >
                      The quick brown fox jumps over 1,234
                    </div>
                    <div className="text-[10px] text-[var(--ink-50)] mt-1 leading-snug">
                      {o.note}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Text size — app-wide, like the browser's Ctrl-+ */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
              Text size
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {UI_SCALES.map((o) => {
                const active = Math.abs(uiScale - o.value) < 0.001
                return (
                  <button
                    key={o.value}
                    onClick={() => {
                      setUiScale(o.value)
                      saveUiScale(o.value)
                      applyUiScale(o.value)
                    }}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-md border transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                        : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`themestudio-uiscale-${o.value}`}
                  >
                    <span className="font-semibold" style={{ fontSize: `${Math.round(11 * o.value)}px` }}>
                      A
                    </span>
                    <span className="text-[10px]">{o.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-[var(--ink-50)] mt-1.5 leading-snug">
              Makes everything in the app larger or smaller, the same as your browser's zoom. Affects all menus,
              lists, and buttons. You can also use the View menu or Cmd and the plus, minus and zero keys. On a
              small laptop the app starts a little smaller so the desk has more room.
            </p>
          </section>

          {/* Density — tightens the chrome's spacing without shrinking text */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
              Density
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { value: 'comfortable' as Density, label: 'Comfortable', icon: 'expand', note: 'Roomier spacing' },
                  { value: 'compact' as Density, label: 'Compact', icon: 'compress', note: 'More room for desks' }
                ]
              ).map((o) => {
                const active = density === o.value
                return (
                  <button
                    key={o.value}
                    onClick={() => {
                      setDensity(o.value)
                      saveDensity(o.value)
                      applyDensity(o.value)
                    }}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-md border transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                        : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`themestudio-density-${o.value}`}
                  >
                    <Icon name={o.icon} size={16} />
                    <span className="text-[11px] font-medium">{o.label}</span>
                    <span className="text-[10px] text-[var(--ink-50)]">{o.note}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-[var(--ink-50)] mt-1.5 leading-snug">
              Compact trims the padding around the sidebar, toolbars, menus and pills so more of the screen is your
              desk. Reading text stays the same size.
            </p>
          </section>

          {/* Canvas background */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
              Canvas background
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-2.5">
              {(
                [
                  { value: 'default' as DeskBgMode, label: 'Default', icon: 'texture' },
                  { value: 'solid' as DeskBgMode, label: 'Solid', icon: 'format_color_fill' },
                  { value: 'gradient' as DeskBgMode, label: 'Gradient', icon: 'gradient' }
                ]
              ).map((o) => (
                <button
                  key={o.value}
                  onClick={() => onCustomizationChange({ deskBgMode: o.value })}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] transition-colors ${
                    c.deskBgMode === o.value
                      ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                      : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                  }`}
                  data-testid={`themestudio-bg-${o.value}`}
                >
                  <Icon
                    name={o.icon}
                    size={16}
                    className={
                      c.deskBgMode === o.value ? 'text-accent' : 'text-[var(--ink-50)]'
                    }
                  />
                  <span>{o.label}</span>
                </button>
              ))}
            </div>

            {c.deskBgMode === 'solid' && (
              <SwatchRow
                label="Background colour"
                value={c.deskColor}
                onChange={(hex) => onCustomizationChange({ deskColor: hex })}
                testid="themestudio-bg-solid-color"
              />
            )}

            {c.deskBgMode === 'gradient' && (
              <div className="space-y-2.5">
                <div
                  className="h-12 rounded-lg border border-[var(--edge-soft)]"
                  style={{
                    background: `linear-gradient(${c.gradAngle}deg, ${c.gradFrom}, ${c.gradTo})`
                  }}
                  data-testid="themestudio-bg-gradient-preview"
                />
                <div className="grid grid-cols-2 gap-2">
                  <SwatchRow
                    label="From"
                    value={c.gradFrom}
                    onChange={(hex) => onCustomizationChange({ gradFrom: hex })}
                    testid="themestudio-grad-from"
                    compact
                  />
                  <SwatchRow
                    label="To"
                    value={c.gradTo}
                    onChange={(hex) => onCustomizationChange({ gradTo: hex })}
                    testid="themestudio-grad-to"
                    compact
                  />
                </div>
                <SliderRow
                  label="Angle"
                  value={c.gradAngle}
                  min={0}
                  max={360}
                  step={5}
                  suffix="°"
                  onChange={(v) => onCustomizationChange({ gradAngle: v })}
                  testid="themestudio-grad-angle"
                />
              </div>
            )}
          </section>

          {/* Glass & depth */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
              Glass &amp; depth
            </div>
            <p className="text-[10px] text-[var(--ink-50)] mb-2 leading-snug">
              Tunes the frosted-glass blur and translucency on the sidebar, toolbar, popovers
              and dialogs all at once.
            </p>
            <SliderRow
              label="Blur"
              value={Math.round(c.glassBlur * 100)}
              min={0}
              max={200}
              step={5}
              suffix="%"
              onChange={(v) => onCustomizationChange({ glassBlur: v / 100 })}
              testid="themestudio-glass-blur"
            />
            <SliderRow
              label="Translucency"
              value={Math.round(c.glassOpacity * 100)}
              min={40}
              max={130}
              step={5}
              suffix="%"
              onChange={(v) => onCustomizationChange({ glassOpacity: v / 100 })}
              testid="themestudio-glass-opacity"
            />
          </section>

          {/* Icons */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-2">
              Icons
            </div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] text-[var(--ink-70)] w-14 shrink-0">
                Weight
              </span>
              <div className="grid grid-cols-4 gap-1 flex-1">
                {ICON_WEIGHTS.map((w) => (
                  <button
                    key={w.value}
                    onClick={() => onCustomizationChange({ iconWeight: w.value })}
                    className={`py-1 rounded text-[10px] border transition-colors ${
                      c.iconWeight === w.value
                        ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                        : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`themestudio-icon-weight-${w.value}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--ink-70)] w-14 shrink-0">
                Style
              </span>
              <div className="grid grid-cols-2 gap-1 flex-1">
                {(
                  [
                    { val: true, label: 'Filled' },
                    { val: false, label: 'Outlined' }
                  ]
                ).map((o) => (
                  <button
                    key={String(o.val)}
                    onClick={() => onCustomizationChange({ iconFilled: o.val })}
                    className={`py-1 rounded text-[10px] border transition-colors ${
                      c.iconFilled === o.val
                        ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                        : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`themestudio-icon-fill-${o.val ? 'filled' : 'outlined'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Live sample — these icons pass no explicit weight/fill, so they
                reflect the global choice immediately. */}
            <div className="flex items-center gap-4 mt-3 px-1 text-[var(--ink-70)]">
              {['home', 'folder', 'settings', 'favorite', 'bolt', 'check_circle'].map((n) => (
                <Icon key={n} name={n} size={22} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// A colour swatch + hex field row used by the background pickers.
function SwatchRow({
  label,
  value,
  onChange,
  testid,
  compact
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  testid: string
  compact?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-2">
      <label
        className="relative h-8 w-8 rounded-md overflow-hidden border border-[var(--edge-firm)] cursor-pointer shrink-0"
        title={label}
      >
        <span className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          data-testid={`${testid}-picker`}
          aria-label={label}
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-[var(--ink-70)]">{label}</div>
        {!compact && (
          <input
            type="text"
            value={value}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            className="mt-0.5 w-24 px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--edge-soft)] text-[11px] font-mono text-[var(--ink-70)] focus:outline-none focus:border-accent"
            data-testid={`${testid}-hex`}
          />
        )}
      </div>
    </div>
  )
}

// A labelled range slider with a live numeric read-out.
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  testid
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (v: number) => void
  testid: string
}): JSX.Element {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[var(--ink-70)]">{label}</span>
        <span className="text-[10px] font-mono text-[var(--ink-50)]">
          {value}
          {suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-accent cursor-pointer"
        data-testid={testid}
      />
    </div>
  )
}
