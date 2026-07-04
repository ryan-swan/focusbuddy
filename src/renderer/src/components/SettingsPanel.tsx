import { useEffect, useRef, useState } from 'react'
import {
  ACCENT_OPTIONS,
  THEME_OPTIONS,
  type AccentColor,
  type FontChoice,
  type ThemeCustomization,
  type ThemeMode
} from '../lib/theme'
import ThemeBuilder from './ThemeBuilder'
import { readDevForcedTier, setDevForcedTier } from '../stores/capabilities'
import type { TierId } from '../lib/capabilityDefaults'
import { captureRitualOrigin, playThemeRitual } from '../lib/themeRitual'
import {
  getSoundPrefs,
  setSoundPrefs,
  subscribeSoundPrefs,
  TYPING_CLICK_STYLES,
  type SoundPrefs,
  type TypingClickStyle
} from '../lib/soundPrefs'
import { previewTypingClick } from '../lib/audioBeep'
import {
  AUTO_ROUTING_DISPLAY,
  MODEL_OPTIONS,
  useModelMode
} from '../lib/modelPrefs'
import { haptic } from '../lib/haptics'
import Icon from './Icon'
import { useViewStore } from '../stores/view'
import AccountSection from './settings/AccountSection'
import OrganisationSection from './settings/OrganisationSection'
import TemplatesSection from './settings/TemplatesSection'
import DocumentsSyncSection from './settings/DocumentsSyncSection'
import ApiKeysSection from './settings/ApiKeysSection'
import BackupSection from './settings/BackupSection'
import NavigationSection from './settings/NavigationSection'
import PrivacyHelpSection from './settings/PrivacyHelpSection'

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
  anchorX: number
  anchorY: number
}

export default function SettingsPanel({
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
  onClose,
  anchorX,
  anchorY
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const goOrg = useViewStore((s) => s.goOrg)
  const [studioOpen, setStudioOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [devTier, setDevTierState] = useState<TierId | null>(() => readDevForcedTier())
  const [sound, setSound] = useState<SoundPrefs>(() => getSoundPrefs())
  const [modelMode, setModelMode] = useModelMode()
  const [hapticsNative, setHapticsNative] = useState<boolean | null>(null)
  const [voicePrefs, setVoicePrefs] = useState<{
    commandMode: 'press-hold' | 'click-toggle'
    autoStopSilenceMs: number
    voiceback: boolean
  } | null>(null)

  useEffect(() => {
    window.api.haptics
      .available()
      .then((ok) => setHapticsNative(ok))
      .catch(() => setHapticsNative(false))
  }, [])

  useEffect(() => {
    window.api.voiceCommand
      .getPrefs()
      .then((p) => setVoicePrefs(p))
      .catch(() => {})
  }, [])

  async function patchVoicePrefs(
    patch: Partial<{
      commandMode: 'press-hold' | 'click-toggle'
      autoStopSilenceMs: number
      voiceback: boolean
    }>
  ): Promise<void> {
    const next = await window.api.voiceCommand.setPrefs(patch)
    setVoicePrefs(next)
  }

  useEffect(() => {
    return subscribeSoundPrefs((p) => setSound(p))
  }, [])

  function updateSound(patch: Partial<SoundPrefs>): void {
    setSoundPrefs(patch)
  }

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

  // Move focus into the popover when it opens so keyboard users land inside it
  // rather than being left on the trigger. The first control is the close
  // button in the header.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
    )
    first?.focus()
  }, [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed z-[200] w-96 max-h-[80vh] overflow-y-auto rounded-lg bg-[var(--surface-sunken)] border border-[var(--edge-soft)] shadow-2xl backdrop-blur"
      style={{ top: anchorY, right: window.innerWidth - anchorX }}
    >
      <div className="px-3 py-2 border-b border-[var(--edge-soft)] flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
          Settings
        </span>
        <button onClick={onClose} className="icon-btn" aria-label="Close settings">
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        <div>
          <div className="text-[11px] text-[var(--ink-70)] mb-1.5">Theme</div>
          <div className="grid grid-cols-5 gap-1">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={(e) => {
                  if (o.value === mode) return
                  // Capture the click position so the ritual ripple emanates
                  // from where the user actually clicked. The ritual then
                  // sandwiches the theme switch inside its veil + ripple.
                  captureRitualOrigin(e)
                  playThemeRitual(() => onModeChange(o.value))
                }}
                className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] transition-colors ${
                  mode === o.value
                    ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                    : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                }`}
              >
                <Icon
                  name={o.icon}
                  size={16}
                  className={mode === o.value ? 'text-accent' : 'text-[var(--ink-50)]'}
                />
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-[var(--ink-70)] mb-1.5">Accent</div>
          <div className="grid grid-cols-5 gap-1">
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
              >
                <span
                  className="h-5 w-5 rounded-full border-2 border-white dark:border-stone-900 shadow"
                  style={{ backgroundColor: o.preview }}
                />
                <span className="text-[10px] text-[var(--ink-70)]">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 -mt-1">
        <button
          onClick={() => setStudioOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-accent/40 bg-accent/[0.06] hover:bg-accent/10 text-[var(--ink-90)] transition-colors"
          data-testid="open-theme-studio"
        >
          <Icon name="palette" size={15} className="text-accent" />
          <div className="flex-1 text-left">
            <div className="text-xs font-medium">Theme studio…</div>
            <div className="text-[10px] text-[var(--ink-50)]">
              Custom accent colour and accessibility fonts. Free for everyone.
            </div>
          </div>
          <Icon name="chevron_right" size={14} className="text-[var(--ink-40)]" />
        </button>

        {import.meta.env.DEV && (
          <div className="mt-2 rounded-md border border-amber-300/60 dark:border-amber-600/40 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="construction" size={13} className="text-amber-600 dark:text-amber-400" />
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber-700 dark:text-amber-400">
                Developer
              </span>
            </div>
            <div className="text-[10px] text-[var(--ink-70)] mb-1.5 leading-snug">
              Force a plan tier locally, no login needed. Dev builds only.
            </div>
            <div className="grid grid-cols-4 gap-1">
              {([null, 'free', 'pro', 'team'] as const).map((t) => {
                const active = devTier === t
                return (
                  <button
                    key={t ?? 'off'}
                    onClick={() => {
                      setDevForcedTier(t)
                      setDevTierState(t)
                    }}
                    className={`px-1.5 py-1 rounded text-[10px] capitalize border transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-[var(--ink-100)] font-medium'
                        : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`dev-tier-${t ?? 'off'}`}
                  >
                    {t ?? 'Off'}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <AccountSection />

      <OrganisationSection
        onManage={() => {
          goOrg()
          onClose()
        }}
      />

      <ApiKeysSection />

      <BackupSection />

      <PrivacyHelpSection />

      {/* Advanced — the tuning surfaces most people never touch (sounds,
          haptics, model routing, voice, templates, sync, navigation). Collapsed
          by default so the everyday settings above stay a short, plain list;
          the review found the old flat panel buried theme/account/backup under
          developer-flavoured detail. */}
      <div className="px-3 py-2 border-t border-[var(--edge-soft)]">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          data-testid="settings-advanced-toggle"
          className="w-full flex items-center gap-1.5 py-1 text-[12px] font-medium text-[var(--ink-70)] hover:text-[var(--ink-100)]"
        >
          <Icon name={advancedOpen ? 'expand_more' : 'chevron_right'} size={15} />
          <span>Advanced</span>
          <span className="ml-auto text-[11px] font-normal text-[var(--ink-40)]">
            sounds, AI model, voice, more
          </span>
        </button>
      </div>
      {advancedOpen && (
        <>
      <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-2">
        <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-1">
          Sounds
        </div>

        <label className="flex items-center justify-between py-1 cursor-pointer">
          <span className="text-xs text-[var(--ink-70)]">Sound effects</span>
          <input
            type="checkbox"
            checked={sound.enabled}
            onChange={(e) => updateSound({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 accent-violet-600 cursor-pointer"
          />
        </label>

        <div className={sound.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <div className="py-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--ink-70)]">Volume</span>
              <span className="text-[10px] text-[var(--ink-50)] font-mono">
                {Math.round(sound.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sound.volume * 100)}
              onChange={(e) => updateSound({ volume: parseInt(e.target.value, 10) / 100 })}
              className="w-full h-1 accent-violet-600 cursor-pointer"
            />
          </div>

          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span className="text-xs text-[var(--ink-70)]">Keyboard click</span>
            <input
              type="checkbox"
              checked={sound.typingClick}
              onChange={(e) => updateSound({ typingClick: e.target.checked })}
              className="h-3.5 w-3.5 accent-violet-600 cursor-pointer"
            />
          </label>

          {sound.typingClick && (
            <div className="pl-3 border-l-2 border-[var(--edge-soft)] py-1 space-y-3">
              {(['tactile', 'ambient'] as const).map((family) => {
                const styles = TYPING_CLICK_STYLES.filter((s) => s.family === family)
                const heading = family === 'tactile' ? 'Tactile' : 'Ambient · spacey'
                const subhead =
                  family === 'tactile'
                    ? 'Physical key feel'
                    : 'Low impact, breathy, dopamine'
                return (
                  <div key={family} className="space-y-1">
                    <div className="flex items-baseline gap-1.5">
                      <div className="text-[10px] text-[var(--ink-50)] uppercase tracking-wider">
                        {heading}
                      </div>
                      <div className="text-[10px] text-[var(--ink-40)] truncate">
                        {subhead}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-0.5">
                      {styles.map((s) => {
                        const active = sound.typingClickStyle === s.value
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => {
                              updateSound({ typingClickStyle: s.value as TypingClickStyle })
                              previewTypingClick(s.value as TypingClickStyle)
                            }}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                              active
                                ? 'bg-accent/10 border border-accent/40 text-[var(--ink-100)]'
                                : 'border border-transparent hover:bg-[var(--surface-sunken)] text-[var(--ink-70)]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium">{s.label}</div>
                              <div className="text-[10px] text-[var(--ink-50)] truncate">
                                {s.blurb}
                              </div>
                            </div>
                            {active ? (
                              <Icon
                                name="check_circle"
                                size={14}
                                filled
                                className="text-accent shrink-0"
                              />
                            ) : (
                              <Icon
                                name="play_arrow"
                                size={14}
                                className="text-[var(--ink-40)] shrink-0"
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <label className="flex items-start justify-between py-1 cursor-pointer gap-2">
            <div className="flex-1">
              <span className="text-xs text-[var(--ink-70)] block">
                Quiet while widget active
              </span>
              <span className="text-[10px] text-[var(--ink-50)]">
                Suppress sounds while you're interacting with a widget (browser, sticky, etc.)
              </span>
            </div>
            <input
              type="checkbox"
              checked={sound.quietWhileWidgetActive}
              onChange={(e) => updateSound({ quietWhileWidgetActive: e.target.checked })}
              className="h-3.5 w-3.5 accent-violet-600 cursor-pointer mt-0.5"
            />
          </label>
        </div>
      </div>

      <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-2">
        <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-1">
          AI Model
        </div>
        <div className="grid grid-cols-1 gap-0.5">
          {MODEL_OPTIONS.map((opt) => {
            const active = modelMode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setModelMode(opt.value)}
                className={`flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                  active
                    ? 'bg-accent/10 border border-accent/40 text-[var(--ink-100)]'
                    : 'border border-transparent hover:bg-[var(--surface-sunken)] text-[var(--ink-70)]'
                }`}
              >
                <Icon
                  name={
                    opt.value === 'auto'
                      ? 'tune'
                      : opt.value === 'haiku'
                        ? 'bolt'
                        : opt.value === 'sonnet'
                          ? 'psychology'
                          : 'auto_awesome'
                  }
                  size={14}
                  className={`mt-0.5 shrink-0 ${active ? 'text-accent' : 'text-[var(--ink-50)]'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {opt.label}
                    <span
                      className={`text-[9px] font-mono px-1 rounded ${
                        active
                          ? 'bg-accent/15 text-accent'
                          : 'bg-[var(--surface-sunken)] text-[var(--ink-70)]'
                      }`}
                    >
                      {opt.costTier}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--ink-50)] leading-snug mt-0.5">
                    {opt.blurb}
                  </div>
                </div>
                {active && (
                  <Icon name="check_circle" size={14} filled className="text-accent shrink-0 mt-0.5" />
                )}
              </button>
            )
          })}
        </div>

        {modelMode === 'auto' && (
          <div className="mt-2 pl-3 border-l-2 border-[var(--edge-soft)] space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-50)]">
              Auto routing
            </div>
            {Object.entries(AUTO_ROUTING_DISPLAY).map(([purpose, info]) => (
              <div
                key={purpose}
                className="flex items-center justify-between text-[10px] py-0.5"
              >
                <span className="text-[var(--ink-70)] capitalize">
                  {purpose.replace('_', ' ')}
                </span>
                <span className="font-mono text-[var(--ink-70)]">
                  {info.model}{' '}
                  <span className="text-[var(--ink-40)]">{info.cost}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
            Haptics
          </div>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              hapticsNative === null
                ? 'bg-[var(--surface-sunken)] text-[var(--ink-50)]'
                : hapticsNative
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
            }`}
          >
            {hapticsNative === null ? 'checking…' : hapticsNative ? 'native' : 'audio fallback'}
          </span>
        </div>
        <p className="text-[10px] text-[var(--ink-50)] leading-snug mb-1">
          {hapticsNative
            ? 'NSHapticFeedbackPerformer is loaded — trackpad pulses fire on supported MacBooks.'
            : "Audio-tactile substitute (no native module). Run `npx electron-rebuild -f -w node-mac-haptics` and restart to activate native."}
        </p>
        <div className="grid grid-cols-5 gap-1">
          {(['light', 'medium', 'rigid', 'success', 'warning'] as const).map((feel) => (
            <button
              key={feel}
              onClick={() => haptic(feel)}
              className="px-2 py-1.5 rounded text-[10px] border border-[var(--edge-soft)] hover:bg-[var(--surface-sunken)] hover:border-accent transition-colors capitalize"
            >
              {feel}
            </button>
          ))}
        </div>
      </div>

          <TemplatesSection />

          <DocumentsSyncSection />

          <NavigationSection />

      {voicePrefs && (
        <div className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
            Voice command (mic button)
          </div>
          <div>
            <div className="text-[11px] text-[var(--ink-70)] mb-1.5">
              Trigger mode
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  {
                    value: 'press-hold' as const,
                    label: 'Press & hold',
                    sub: 'Walkie-talkie — release to send'
                  },
                  {
                    value: 'click-toggle' as const,
                    label: 'Click to toggle',
                    sub: 'Auto-stops on silence'
                  }
                ]
              ).map((o) => (
                <button
                  key={o.value}
                  onClick={() => void patchVoicePrefs({ commandMode: o.value })}
                  className={`text-left px-2.5 py-2 rounded-md border text-[11px] transition-colors ${
                    voicePrefs.commandMode === o.value
                      ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                      : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
                  }`}
                  data-testid={`voice-mode-${o.value}`}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="text-[9px] text-[var(--ink-50)] mt-0.5">
                    {o.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {voicePrefs.commandMode === 'click-toggle' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--ink-70)]">
                  Auto-stop after silence
                </span>
                <span className="text-[10px] font-mono text-[var(--ink-50)]">
                  {(voicePrefs.autoStopSilenceMs / 1000).toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={1000}
                max={15000}
                step={500}
                value={voicePrefs.autoStopSilenceMs}
                onChange={(e) =>
                  void patchVoicePrefs({ autoStopSilenceMs: Number(e.target.value) })
                }
                className="w-full accent-accent"
                data-testid="voice-silence-slider"
              />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={voicePrefs.voiceback}
              onChange={(e) => void patchVoicePrefs({ voiceback: e.target.checked })}
              className="accent-accent"
              data-testid="voice-voiceback-checkbox"
            />
            <span className="text-[11px] text-[var(--ink-70)]">
              Speak the AI's reply aloud
            </span>
          </label>
          <p className="text-[10px] text-[var(--ink-50)] leading-snug">
            Press the floating mic at the bottom of the canvas to give the AI a
            verbal command. It returns suggestions you can Apply or Dismiss —
            just like AI-generated tasks.
          </p>
        </div>
      )}

        </>
      )}


      <div className="px-3 py-2 border-t border-[var(--edge-soft)] bg-[var(--surface-sunken)]/50 text-[11px] text-[var(--ink-70)]">
        Preferences saved locally.
      </div>

      {studioOpen && (
        <ThemeBuilder
          mode={mode}
          accent={accent}
          font={font}
          customAccentHex={customAccentHex}
          customization={customization}
          onModeChange={onModeChange}
          onAccentChange={onAccentChange}
          onFontChange={onFontChange}
          onCustomAccentChange={onCustomAccentChange}
          onCustomizationChange={onCustomizationChange}
          onResetCustomization={onResetCustomization}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </div>
  )
}
