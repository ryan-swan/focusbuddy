// Persisted preferences for the voice command FAB.
//
// commandMode controls how the floating mic captures audio:
//   - 'press-hold'   : record while the button is held down (walkie-talkie)
//   - 'click-toggle' : click to start, auto-stop after `autoStopSilenceMs`
//                      of silence (hands-free)
// voiceback toggles a spoken summary of pending proposals via SpeechSynthesis
// once the AI returns ("I'll create 3 sticky notes — confirm?").

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type VoiceCommandMode = 'press-hold' | 'click-toggle'

export interface VoiceCommandPrefs {
  commandMode: VoiceCommandMode
  autoStopSilenceMs: number
  voiceback: boolean
}

interface PrefShape extends VoiceCommandPrefs {
  v: 1
}

const DEFAULTS: PrefShape = {
  commandMode: 'press-hold',
  autoStopSilenceMs: 5000,
  voiceback: true,
  v: 1
}

let cache: PrefShape | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'voice-command.json')
}

function load(): PrefShape {
  if (cache) return cache
  try {
    if (!existsSync(filePath())) {
      cache = { ...DEFAULTS }
      return cache
    }
    const raw = readFileSync(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PrefShape>
    cache = {
      commandMode:
        parsed.commandMode === 'click-toggle' || parsed.commandMode === 'press-hold'
          ? parsed.commandMode
          : DEFAULTS.commandMode,
      autoStopSilenceMs:
        typeof parsed.autoStopSilenceMs === 'number' &&
        parsed.autoStopSilenceMs >= 1000 &&
        parsed.autoStopSilenceMs <= 30000
          ? parsed.autoStopSilenceMs
          : DEFAULTS.autoStopSilenceMs,
      voiceback: typeof parsed.voiceback === 'boolean' ? parsed.voiceback : DEFAULTS.voiceback,
      v: 1
    }
    return cache
  } catch {
    cache = { ...DEFAULTS }
    return cache
  }
}

export function getVoiceCommandPrefs(): VoiceCommandPrefs {
  const { commandMode, autoStopSilenceMs, voiceback } = load()
  return { commandMode, autoStopSilenceMs, voiceback }
}

export function setVoiceCommandPrefs(patch: Partial<VoiceCommandPrefs>): VoiceCommandPrefs {
  const cur = load()
  cache = {
    ...cur,
    ...patch,
    v: 1
  }
  // Clamp silence ms defensively.
  if (
    typeof cache.autoStopSilenceMs !== 'number' ||
    cache.autoStopSilenceMs < 1000 ||
    cache.autoStopSilenceMs > 30000
  ) {
    cache.autoStopSilenceMs = DEFAULTS.autoStopSilenceMs
  }
  try {
    writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[voiceCommandPref] save failed:', err)
  }
  return getVoiceCommandPrefs()
}
