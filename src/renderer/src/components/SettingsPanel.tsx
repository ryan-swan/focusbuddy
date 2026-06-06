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
import ApiKeysSection from './settings/ApiKeysSection'
import NavigationSection from './settings/NavigationSection'

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
  const [studioOpen, setStudioOpen] = useState(false)
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

  return (
    <div
      ref={ref}
      className="fixed z-[200] w-80 max-h-[80vh] overflow-y-auto rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl backdrop-blur"
      style={{ top: anchorY, right: window.innerWidth - anchorX }}
    >
      <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium">
          Appearance
        </span>
        <button onClick={onClose} className="icon-btn" aria-label="Close settings">
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        <div>
          <div className="text-[11px] text-stone-600 dark:text-stone-400 mb-1.5">Theme</div>
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
                    ? 'border-accent bg-accent/10 text-stone-900 dark:text-stone-100'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                }`}
              >
                <Icon
                  name={o.icon}
                  size={16}
                  className={mode === o.value ? 'text-accent' : 'text-stone-500 dark:text-stone-400'}
                />
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-stone-600 dark:text-stone-400 mb-1.5">Accent</div>
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
                    ? 'border-stone-700 dark:border-stone-300 bg-stone-100 dark:bg-stone-700'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700'
                }`}
              >
                <span
                  className="h-5 w-5 rounded-full border-2 border-white dark:border-stone-900 shadow"
                  style={{ backgroundColor: o.preview }}
                />
                <span className="text-[10px] text-stone-600 dark:text-stone-400">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 -mt-1">
        <button
          onClick={() => setStudioOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-accent/40 bg-accent/[0.06] hover:bg-accent/10 text-stone-800 dark:text-stone-200 transition-colors"
          data-testid="open-theme-studio"
        >
          <Icon name="palette" size={15} className="text-accent" />
          <div className="flex-1 text-left">
            <div className="text-xs font-medium">Theme studio…</div>
            <div className="text-[10px] text-stone-500 dark:text-stone-400">
              Custom accent colour and accessibility fonts. Free for everyone.
            </div>
          </div>
          <Icon name="chevron_right" size={14} className="text-stone-400" />
        </button>

        {import.meta.env.DEV && (
          <div className="mt-2 rounded-md border border-amber-300/60 dark:border-amber-600/40 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="construction" size={13} className="text-amber-600 dark:text-amber-400" />
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber-700 dark:text-amber-400">
                Developer
              </span>
            </div>
            <div className="text-[10px] text-stone-600 dark:text-stone-400 mb-1.5 leading-snug">
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
                        ? 'border-accent bg-accent/10 text-stone-900 dark:text-stone-100 font-medium'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'
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

      <div className="px-3 py-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium mb-1">
          Sounds
        </div>

        <label className="flex items-center justify-between py-1 cursor-pointer">
          <span className="text-xs text-stone-700 dark:text-stone-300">Sound effects</span>
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
              <span className="text-xs text-stone-700 dark:text-stone-300">Volume</span>
              <span className="text-[10px] text-stone-500 dark:text-stone-500 font-mono">
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
            <span className="text-xs text-stone-700 dark:text-stone-300">Keyboard click</span>
            <input
              type="checkbox"
              checked={sound.typingClick}
              onChange={(e) => updateSound({ typingClick: e.target.checked })}
              className="h-3.5 w-3.5 accent-violet-600 cursor-pointer"
            />
          </label>

          {sound.typingClick && (
            <div className="pl-3 border-l-2 border-stone-200 dark:border-stone-700 py-1 space-y-3">
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
                      <div className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                        {heading}
                      </div>
                      <div className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
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
                                ? 'bg-accent/10 border border-accent/40 text-stone-900 dark:text-stone-100'
                                : 'border border-transparent hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium">{s.label}</div>
                              <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
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
                                className="text-stone-400 dark:text-stone-500 shrink-0"
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
              <span className="text-xs text-stone-700 dark:text-stone-300 block">
                Quiet while widget active
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-500">
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

      <div className="px-3 py-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium mb-1">
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
                    ? 'bg-accent/10 border border-accent/40 text-stone-900 dark:text-stone-100'
                    : 'border border-transparent hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
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
                  className={`mt-0.5 shrink-0 ${active ? 'text-accent' : 'text-stone-500 dark:text-stone-400'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {opt.label}
                    <span
                      className={`text-[9px] font-mono px-1 rounded ${
                        active
                          ? 'bg-accent/15 text-accent'
                          : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      {opt.costTier}
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug mt-0.5">
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
          <div className="mt-2 pl-3 border-l-2 border-stone-200 dark:border-stone-700 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Auto routing
            </div>
            {Object.entries(AUTO_ROUTING_DISPLAY).map(([purpose, info]) => (
              <div
                key={purpose}
                className="flex items-center justify-between text-[10px] py-0.5"
              >
                <span className="text-stone-600 dark:text-stone-400 capitalize">
                  {purpose.replace('_', ' ')}
                </span>
                <span className="font-mono text-stone-700 dark:text-stone-300">
                  {info.model}{' '}
                  <span className="text-stone-400 dark:text-stone-500">{info.cost}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium">
            Haptics
          </div>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              hapticsNative === null
                ? 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                : hapticsNative
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
            }`}
          >
            {hapticsNative === null ? 'checking…' : hapticsNative ? 'native' : 'audio fallback'}
          </span>
        </div>
        <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug mb-1">
          {hapticsNative
            ? 'NSHapticFeedbackPerformer is loaded — trackpad pulses fire on supported MacBooks.'
            : "Audio-tactile substitute (no native module). Run `npx electron-rebuild -f -w node-mac-haptics` and restart to activate native."}
        </p>
        <div className="grid grid-cols-5 gap-1">
          {(['light', 'medium', 'rigid', 'success', 'warning'] as const).map((feel) => (
            <button
              key={feel}
              onClick={() => haptic(feel)}
              className="px-2 py-1.5 rounded text-[10px] border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 hover:border-accent transition-colors capitalize"
            >
              {feel}
            </button>
          ))}
        </div>
      </div>

      <ApiKeysSection />

      <NavigationSection />

      {voicePrefs && (
        <div className="px-3 py-3 border-t border-stone-200 dark:border-stone-700 space-y-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium">
            Voice command (mic button)
          </div>
          <div>
            <div className="text-[11px] text-stone-600 dark:text-stone-400 mb-1.5">
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
                      ? 'border-accent bg-accent/10 text-stone-900 dark:text-stone-100'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                  data-testid={`voice-mode-${o.value}`}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="text-[9px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {o.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {voicePrefs.commandMode === 'click-toggle' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-stone-600 dark:text-stone-400">
                  Auto-stop after silence
                </span>
                <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400">
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
            <span className="text-[11px] text-stone-700 dark:text-stone-200">
              Speak the AI's reply aloud
            </span>
          </label>
          <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug">
            Press the floating mic at the bottom of the canvas to give the AI a
            verbal command. It returns suggestions you can Apply or Dismiss —
            just like AI-generated tasks.
          </p>
        </div>
      )}

      <div className="px-3 py-2 border-t border-stone-200 dark:border-stone-700 bg-stone-100/50 dark:bg-stone-800/50 text-[10px] text-stone-500 dark:text-stone-500">
        Preferences saved locally. Click sounds in browser widgets aren't captured yet — only in stickies, notes, chat, and dialogs.
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
