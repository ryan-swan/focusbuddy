// Lightweight Web Audio beeper — no deps.
// All public sound functions respect user preferences (master enable, volume, scope).

import { effectiveVolume, getSoundPrefs, shouldPlay } from './soundPrefs'

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

export function beep(freq = 660, durationMs = 120, volume = 0.12): void {
  if (!shouldPlay()) return
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const now = c.currentTime
    const vol = effectiveVolume(volume)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
    osc.start(now)
    osc.stop(now + durationMs / 1000 + 0.02)
  } catch {
    // user hasn't interacted with page yet; AudioContext suspended
  }
}

export function alarm(): void {
  beep(660, 140, 0.16)
  window.setTimeout(() => beep(880, 140, 0.18), 180)
  window.setTimeout(() => beep(1100, 240, 0.2), 360)
}

export function chimeIn(): void {
  beep(660, 70, 0.09)
  window.setTimeout(() => beep(880, 90, 0.11), 70)
}

// Stream Deck button feedback sounds — three flavours so users can dial
// in the right feel. All very short (~40-90ms) so rapid presses don't
// stack uncomfortably.
export function streamDeckClick(
  variant: 'click' | 'tick' | 'thunk' | 'silent' = 'click'
): void {
  if (variant === 'silent') return
  if (!shouldPlay()) return
  try {
    const c = getCtx()
    const now = c.currentTime
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    if (variant === 'click') {
      // High snap — like a mechanical keyboard cap.
      osc.type = 'square'
      osc.frequency.setValueAtTime(2200, now)
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.04)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(effectiveVolume(0.08), now + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
      osc.start(now)
      osc.stop(now + 0.08)
    } else if (variant === 'tick') {
      // Crisper, higher — like a UI tick / typewriter.
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(3000, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(effectiveVolume(0.05), now + 0.003)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
      osc.start(now)
      osc.stop(now + 0.05)
    } else if (variant === 'thunk') {
      // Lower, fuller — like a chunky button.
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180, now)
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.08)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(effectiveVolume(0.14), now + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
      osc.start(now)
      osc.stop(now + 0.12)
    }
  } catch {
    // ignore — AudioContext might be suspended
  }
}

export function chimeOut(): void {
  beep(660, 70, 0.08)
  window.setTimeout(() => beep(440, 90, 0.08), 70)
}

/** Section created — warm low→fifth two-note "settled" tone */
export function sectionCreate(): void {
  beep(330, 90, 0.07)
  window.setTimeout(() => beep(495, 140, 0.09), 90)
}

/** Task marked done — triumphant 4-note ascending arpeggio */
export function taskComplete(): void {
  beep(523, 90, 0.1) // C5
  window.setTimeout(() => beep(659, 90, 0.11), 90) // E5
  window.setTimeout(() => beep(784, 90, 0.12), 180) // G5
  window.setTimeout(() => beep(1047, 240, 0.14), 270) // C6
}

/** Single soft tap — for non-section widget spawn */
export function widgetOpen(): void {
  beep(880, 50, 0.06)
}

export function futuristicPowerOn(): void {
  if (!shouldPlay()) return
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    const t = c.currentTime
    const vol = effectiveVolume(0.14)
    osc.frequency.setValueAtTime(220, t)
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.5)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
    osc.start(t)
    osc.stop(t + 0.6)
  } catch {
    // audio not yet available
  }
}

export function futuristicPowerOff(): void {
  if (!shouldPlay()) return
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    const t = c.currentTime
    const vol = effectiveVolume(0.1)
    osc.frequency.setValueAtTime(880, t)
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.3)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    osc.start(t)
    osc.stop(t + 0.34)
  } catch {
    // audio not yet available
  }
}

// ── Keypress click profiles ────────────────────────────────────────────────────
// Each profile uses different synthesis to give a distinct character.
// Picked by SoundPrefs.typingClickStyle; runs only when typingClick is enabled.

function clickMechanical(c: AudioContext, vol: number): void {
  // Original — short burst of decaying white noise. Crisp, computer-keyboard feel.
  const sampleCount = Math.floor(c.sampleRate * 0.012)
  const buf = c.createBuffer(1, sampleCount, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 40)
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const gain = c.createGain()
  src.connect(gain)
  gain.connect(c.destination)
  gain.gain.value = vol
  src.start()
}

function clickSoft(c: AudioContext, vol: number): void {
  // Pure sine, low pitch, ultra-short envelope. Velvet thump — easy on the ears.
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  const t = c.currentTime
  osc.frequency.setValueAtTime(180, t)
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.04)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.5), t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  osc.start(t)
  osc.stop(t + 0.07)
}

function clickTypewriter(c: AudioContext, vol: number): void {
  // Noise burst + body resonance — old IBM typewriter ring.
  const t = c.currentTime
  // Noise burst (the hammer strike)
  const sampleCount = Math.floor(c.sampleRate * 0.008)
  const buf = c.createBuffer(1, sampleCount, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25)
  }
  const noise = c.createBufferSource()
  noise.buffer = buf
  const noiseGain = c.createGain()
  noise.connect(noiseGain)
  noiseGain.connect(c.destination)
  noiseGain.gain.value = vol * 0.6
  noise.start(t)
  // Tonal body — quick decaying square
  const osc = c.createOscillator()
  const oscGain = c.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(420, t)
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.08)
  osc.connect(oscGain)
  oscGain.connect(c.destination)
  oscGain.gain.setValueAtTime(0.0001, t)
  oscGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.25), t + 0.005)
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  osc.start(t)
  osc.stop(t + 0.1)
}

function clickBubble(c: AudioContext, vol: number): void {
  // Quick rising sine, playful pop — like a soft droplet.
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  const t = c.currentTime
  osc.frequency.setValueAtTime(420, t)
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.05)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.35), t + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  osc.start(t)
  osc.stop(t + 0.08)
}

function clickMarimba(c: AudioContext, vol: number): void {
  // Warm wooden tone — fundamental + 4x harmonic, fast decay.
  const t = c.currentTime
  for (const [freq, mult, dur] of [
    [520, 1.0, 0.12],
    [2080, 0.18, 0.06]
  ] as const) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.45 * mult), t + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }
}

// ── Ambient profiles — low-impact, spacey, breathy, dopamine-coded ────────────

function clickWhisper(c: AudioContext, vol: number): void {
  // Filtered noise with a gentle attack-release envelope. ASMR exhale.
  const t = c.currentTime
  const sampleCount = Math.floor(c.sampleRate * 0.045)
  const buf = c.createBuffer(1, sampleCount, c.sampleRate)
  const data = buf.getChannelData(0)
  const attackLen = Math.floor(sampleCount * 0.2)
  for (let i = 0; i < data.length; i++) {
    const env =
      i < attackLen
        ? i / attackLen
        : Math.exp(-(i - attackLen) / (sampleCount * 0.35))
    data[i] = (Math.random() * 2 - 1) * env
  }
  const noise = c.createBufferSource()
  noise.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1100
  filter.Q.value = 0.6
  const gain = c.createGain()
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  gain.gain.value = vol * 0.55
  noise.start(t)
}

function clickVapor(c: AudioContext, vol: number): void {
  // Air burst → ethereal pad bloom. Spacey + breathy.
  const t = c.currentTime
  // 1) Quick bandpassed air burst — the "shh"
  const sampleCount = Math.floor(c.sampleRate * 0.05)
  const buf = c.createBuffer(1, sampleCount, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.25))
  }
  const noise = c.createBufferSource()
  noise.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2000
  filter.Q.value = 1.4
  const noiseGain = c.createGain()
  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(c.destination)
  noiseGain.gain.value = vol * 0.35
  noise.start(t)
  // 2) Pad — sine with slight upward glide and a tiny detuned twin for shimmer
  for (const detune of [0, 7] as const) {
    const padOsc = c.createOscillator()
    const padGain = c.createGain()
    padOsc.connect(padGain)
    padGain.connect(c.destination)
    padOsc.type = 'sine'
    padOsc.detune.value = detune
    padOsc.frequency.setValueAtTime(523, t) // C5
    padOsc.frequency.exponentialRampToValueAtTime(784, t + 0.13) // G5
    padGain.gain.setValueAtTime(0.0001, t + 0.005)
    padGain.gain.exponentialRampToValueAtTime(vol * 0.18, t + 0.035)
    padGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    padOsc.start(t + 0.005)
    padOsc.stop(t + 0.24)
  }
}

function clickStardust(c: AudioContext, vol: number): void {
  // Sparkling glide — high sine swept up, with a delayed octave shimmer.
  const t = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1400, t)
  osc.frequency.exponentialRampToValueAtTime(2400, t + 0.06)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.22), t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
  osc.start(t)
  osc.stop(t + 0.12)
  // Late octave twinkle
  const sparkle = c.createOscillator()
  const sparkleGain = c.createGain()
  sparkle.connect(sparkleGain)
  sparkleGain.connect(c.destination)
  sparkle.type = 'sine'
  sparkle.frequency.value = 3200
  sparkleGain.gain.setValueAtTime(0.0001, t + 0.018)
  sparkleGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.1), t + 0.025)
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
  sparkle.start(t + 0.018)
  sparkle.stop(t + 0.1)
}

function clickCrystal(c: AudioContext, vol: number): void {
  // Bell-style — fundamental + inharmonic partial (classic bell character).
  const t = c.currentTime
  for (const [freq, mult, dur] of [
    [1320, 1.0, 0.22],
    [2640, 0.32, 0.14]
  ] as const) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.3 * mult), t + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }
}

function clickHalo(c: AudioContext, vol: number): void {
  // Pillowy sine pad with subtle vibrato. Warm and round.
  const t = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.value = 660
  // Vibrato via LFO
  const lfo = c.createOscillator()
  const lfoGain = c.createGain()
  lfo.frequency.value = 7
  lfoGain.gain.value = 4 // ±4Hz vibrato
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.32), t + 0.035)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + 0.2)
  lfo.stop(t + 0.2)
}

function playClickByStyle(
  c: AudioContext,
  vol: number,
  style: import('./soundPrefs').TypingClickStyle
): void {
  switch (style) {
    case 'mechanical':
      clickMechanical(c, vol)
      break
    case 'typewriter':
      clickTypewriter(c, vol)
      break
    case 'bubble':
      clickBubble(c, vol)
      break
    case 'marimba':
      clickMarimba(c, vol)
      break
    case 'whisper':
      clickWhisper(c, vol)
      break
    case 'vapor':
      clickVapor(c, vol)
      break
    case 'stardust':
      clickStardust(c, vol)
      break
    case 'crystal':
      clickCrystal(c, vol)
      break
    case 'halo':
      clickHalo(c, vol)
      break
    case 'soft':
    default:
      clickSoft(c, vol)
      break
  }
}

/** Keypress feedback — dispatches to the user-chosen click profile */
export function typingClick(): void {
  if (!shouldPlay()) return
  const prefs = getSoundPrefs()
  if (!prefs.typingClick) return
  try {
    playClickByStyle(getCtx(), effectiveVolume(0.4), prefs.typingClickStyle)
  } catch {
    // audio not ready
  }
}

/** Plays one click of the given style — used for preview buttons in settings */
export function previewTypingClick(style: import('./soundPrefs').TypingClickStyle): void {
  if (!shouldPlay()) return
  try {
    playClickByStyle(getCtx(), effectiveVolume(0.4), style)
  } catch {
    // audio not ready
  }
}
