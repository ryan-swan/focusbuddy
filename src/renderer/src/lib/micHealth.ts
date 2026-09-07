// DEC-130 — is the microphone actually delivering sound?
//
// Operator live QA (2026-09-07): "Record notes" ran for three minutes and the
// transcript came back as "you you you you you you". The microphone track was
// live — label, enabled, not muted — and every sample it delivered was a
// digital zero: on macOS an app the system has not allowed to use the
// microphone gets a working-looking stream of silence, never an error. The
// engine then hallucinated on the silence and the summary summarised nothing.
//
// Two guards, one message:
//   probeMicrophone   a short listen BEFORE a recording starts — digital
//                     silence refuses to start and says why (with the door
//                     to System Settings);
//   watchMicrophone   a live sentinel WHILE recording — the bar shows the
//                     level, and after DIGITAL_SILENCE_AFTER_MS of zeros it
//                     says nothing is reaching Plexii, so a silent three
//                     minutes cannot happen unnoticed again.
//
// "Digital silence" means peak === 0 across the window. A real microphone in
// a quiet room still carries a noise floor above zero, so this never fires on
// someone who simply is not talking yet.

export const DIGITAL_SILENCE_AFTER_MS = 3000

export interface MicReading {
  peak: number
  rms: number
}

export interface MicWatchState extends MicReading {
  /** Milliseconds since the last non-zero sample (0 while sound arrives). */
  silentMs: number
  /** silentMs has reached DIGITAL_SILENCE_AFTER_MS. */
  digitalSilence: boolean
}

export const MIC_SILENCE_MESSAGE =
  'Plexii is receiving silence from the microphone — every sample is zero. On a Mac that almost always means Plexii is not allowed to use the microphone: open System Settings › Privacy & Security › Microphone, turn it on for Plexii, then try again.'

export const MIC_DENIED_MESSAGE =
  'Plexii is not allowed to use the microphone. Open System Settings › Privacy & Security › Microphone, turn it on for Plexii, then try again.'

/** The next "silent for" reading: sound resets it, a zero frame extends it.
 *  Pure, so the sentinel's rule is unit-testable. */
export function nextSilentMs(prevSilentMs: number, dtMs: number, peak: number): number {
  return peak > 0 ? 0 : prevSilentMs + Math.max(0, dtMs)
}

/** Read one frame off an analyser: the peak and RMS of the time-domain signal. */
export function readLevel(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): MicReading {
  analyser.getFloatTimeDomainData(buf)
  let peak = 0
  let sum = 0
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]
    const a = v < 0 ? -v : v
    if (a > peak) peak = a
    sum += v * v
  }
  return { peak, rms: Math.sqrt(sum / buf.length) }
}

function analyserFor(stream: MediaStream): { ctx: AudioContext; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null {
  try {
    const AC: typeof AudioContext =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
    const ctx = new AC()
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    src.connect(analyser)
    return { ctx, analyser, buf: new Float32Array(analyser.fftSize) }
  } catch {
    return null
  }
}

/** Listen for `ms` and report whether the stream is digitally silent. Never
 *  records or stores anything; the stream is left open for the caller. When
 *  Web Audio itself is unavailable the answer is "not silent" — the guard
 *  must never block a recording it cannot judge. */
export async function probeMicrophone(
  stream: MediaStream,
  ms = 1200
): Promise<{ peak: number; rms: number; digitalSilence: boolean }> {
  const a = analyserFor(stream)
  if (!a) return { peak: 1, rms: 1, digitalSilence: false }
  let peak = 0
  let rmsSum = 0
  let frames = 0
  const t0 = Date.now()
  try {
    while (Date.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 50))
      const r = readLevel(a.analyser, a.buf)
      if (r.peak > peak) peak = r.peak
      rmsSum += r.rms
      frames++
    }
  } finally {
    await a.ctx.close().catch(() => {})
  }
  return { peak, rms: frames ? rmsSum / frames : 0, digitalSilence: frames > 0 && peak === 0 }
}

/** The live sentinel: `onTick` every `intervalMs` with the level and how long
 *  the stream has been digitally silent. Returns the stop function. */
export function watchMicrophone(
  stream: MediaStream,
  onTick: (state: MicWatchState) => void,
  intervalMs = 250
): () => void {
  const a = analyserFor(stream)
  if (!a) return () => {}
  let silentMs = 0
  let last = Date.now()
  const iv = window.setInterval(() => {
    const now = Date.now()
    const r = readLevel(a.analyser, a.buf)
    silentMs = nextSilentMs(silentMs, now - last, r.peak)
    last = now
    onTick({ ...r, silentMs, digitalSilence: silentMs >= DIGITAL_SILENCE_AFTER_MS })
  }, intervalMs)
  return () => {
    window.clearInterval(iv)
    void a.ctx.close().catch(() => {})
  }
}

/** The one door: macOS's Microphone privacy pane. Elsewhere there is nothing
 *  to open, and the message alone has to do. */
export function openMicrophoneSettings(): void {
  if (navigator.platform.toLowerCase().includes('mac')) {
    void window.api.files.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
  }
}

export type MicAccess = { ok: true } | { ok: false; reason: 'mic-denied'; message: string }

/** Ask the system before touching the microphone (macOS: the native prompt
 *  the first time, the plain truth after a refusal). Guarded: an app built
 *  before the `media` bridge existed — or one not yet restarted onto it —
 *  simply proceeds, and the probe catches the silence instead. */
export async function ensureMicrophoneAccess(): Promise<MicAccess> {
  // The bridge is typed as always present; at runtime an app not yet
  // restarted onto the preload that carries it has no `media` at all.
  const media = window.api.media as typeof window.api.media | undefined
  if (!media?.micStatus) return { ok: true }
  try {
    let status = await media.micStatus()
    if (status === 'not-determined' && media.askMicrophone) {
      const granted = await media.askMicrophone()
      status = granted ? 'granted' : 'denied'
    }
    if (status === 'denied' || status === 'restricted') return { ok: false, reason: 'mic-denied', message: MIC_DENIED_MESSAGE }
  } catch {
    /* an unreadable status never blocks — the probe decides */
  }
  return { ok: true }
}

/** A recording door's answer: started, or exactly why not. */
export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'mic-denied' | 'mic-silent' | 'failed'; message: string }

export const MIC_FAILED_MESSAGE = 'Could not access the microphone. Check your system permissions.'
