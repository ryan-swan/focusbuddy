import Icon from './Icon'
import { DIGITAL_SILENCE_AFTER_MS, openMicrophoneSettings } from '../lib/micHealth'

// DEC-130 — what the microphone is doing, while a recording runs: five bars
// of level, or — after DIGITAL_SILENCE_AFTER_MS of zeros — the plain truth
// that nothing is reaching Plexii, with the one door that fixes it. Worn by
// the PlexiMeet recording bar and the guest-capture bar alike.

export default function MicLevelPill({
  peak,
  silentMs,
  dark = false
}: {
  peak: number
  silentMs: number
  /** On a dark bar (guest capture) the bars and text invert. */
  dark?: boolean
}): JSX.Element {
  const silent = silentMs >= DIGITAL_SILENCE_AFTER_MS
  if (silent) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${
          dark ? 'bg-amber-400/20 text-amber-200' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }`}
        title="Every sample from the microphone is zero. On a Mac this means Plexii is not allowed to use the microphone."
        data-testid="mic-silent"
      >
        <Icon name="mic_off" size={13} />
        No sound is reaching Plexii
        <button
          onClick={openMicrophoneSettings}
          className="underline underline-offset-2 fb-press"
          title="Open System Settings › Privacy & Security › Microphone"
          data-testid="mic-settings"
        >
          Microphone settings
        </button>
      </span>
    )
  }
  // Five bars; a whisper lights one, speech lights them all.
  const lit = peak <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(Math.log10(peak * 1000) * 2)))
  return (
    <span
      className={`inline-flex items-end gap-[2px] h-4 px-1 ${dark ? 'text-emerald-300' : 'text-emerald-500'}`}
      title={peak > 0 ? 'Plexii can hear you' : 'Listening…'}
      aria-label={peak > 0 ? 'Plexii can hear you' : 'Listening'}
      data-testid="mic-level"
      data-lit={lit}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm transition-colors ${i < lit ? 'bg-current' : dark ? 'bg-white/20' : 'bg-[var(--ink-30)]'}`}
          style={{ height: `${6 + i * 2.5}px` }}
        />
      ))}
    </span>
  )
}
