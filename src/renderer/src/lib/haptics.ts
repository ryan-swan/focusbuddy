// Haptics — tries native macOS haptic feedback via the main process bridge.
// If unavailable (non-Mac, or the optional `node-mac-haptics` module isn't installed),
// falls back to a near-subliminal audio-tactile click via the same AudioContext used
// for the rest of the app's sound design. This way every call site has SOMETHING to
// feel/hear today, and upgrading to true trackpad haptics is one `npm install` away.

import type { HapticFeel } from '@shared/types'
import { effectiveVolume, getSoundPrefs } from './soundPrefs'

export type { HapticFeel }

let ctx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    ctx = new Ctor()
  }
  // AudioContext can start in 'suspended' state under Chromium autoplay policy. Resume
  // on every call (no-op if already running) so the click actually plays. This is the
  // common gotcha when each module has its own AudioContext singleton.
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  return ctx
}

// One-time check — cached after first call to avoid IPC chatter on every haptic
let nativeAvailable: boolean | null = null
let nativeCheckInflight: Promise<boolean> | null = null

async function checkNative(): Promise<boolean> {
  if (nativeAvailable !== null) return nativeAvailable
  if (nativeCheckInflight) return nativeCheckInflight
  nativeCheckInflight = (async () => {
    try {
      const ok = await window.api.haptics.available()
      nativeAvailable = ok
      return ok
    } catch {
      nativeAvailable = false
      return false
    } finally {
      nativeCheckInflight = null
    }
  })()
  return nativeCheckInflight
}

// Audio-tactile fallback — short low-mid clicks tuned to feel more "felt" than "heard"
// without being so subtle you miss them. Different feels = different frequency/duration.
//
// Unlike chimes, haptics are FEEDBACK SIGNALS — they fire even when "quiet while widget
// active" is on. They respect only the master sound enable.
function audioTactile(feel: HapticFeel): void {
  const prefs = getSoundPrefs()
  if (!prefs.enabled) return
  try {
    const c = getCtx()
    const t = c.currentTime
    const vol = effectiveVolume(0.45) // up from 0.18 — needs to be audible to register

    const tick = (freq: number, durMs: number, delayMs: number, mult = 1): void => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain)
      gain.connect(c.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t + delayMs / 1000
      const stop = start + durMs / 1000
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * mult), start + 0.003)
      gain.gain.exponentialRampToValueAtTime(0.0001, stop)
      osc.start(start)
      osc.stop(stop + 0.02)
    }

    switch (feel) {
      case 'light':
        tick(140, 22, 0, 0.7)
        break
      case 'medium':
        tick(110, 32, 0, 1.0)
        break
      case 'rigid':
        tick(90, 18, 0, 1.2)
        break
      case 'success':
        // Two clicks rising — feels like "click-CLICK"
        tick(140, 22, 0, 0.9)
        tick(220, 30, 55, 1.0)
        break
      case 'warning':
        // Three quick clicks
        tick(100, 18, 0, 1.0)
        tick(100, 18, 60, 1.0)
        tick(100, 24, 120, 1.0)
        break
    }
  } catch {
    // AudioContext not yet allowed by autoplay policy; haptics are best-effort
  }
}

// Public API — fire-and-forget. ALWAYS plays the audio-tactile click; also fires native
// haptic if available. Doing both is the safest UX because the native call can silently
// no-op on Macs without haptic-capable trackpads (we can't detect this from JS).
export function haptic(feel: HapticFeel = 'light'): void {
  // Fire audio synchronously so it's perceptible regardless of native bridge state
  audioTactile(feel)
  // Native is best-effort additive
  void (async () => {
    if (await checkNative()) {
      void window.api.haptics.fire(feel).catch(() => {})
    }
  })()
}

// Convenience wrappers — fluent at call sites
export const hapticLight = (): void => haptic('light')
export const hapticMedium = (): void => haptic('medium')
export const hapticSuccess = (): void => haptic('success')
export const hapticWarning = (): void => haptic('warning')
export const hapticRigid = (): void => haptic('rigid')
