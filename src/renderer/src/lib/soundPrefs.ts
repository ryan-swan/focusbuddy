export type TypingClickStyle =
  | 'soft'
  | 'mechanical'
  | 'typewriter'
  | 'bubble'
  | 'marimba'
  | 'whisper'
  | 'vapor'
  | 'stardust'
  | 'crystal'
  | 'halo'

export type ClickFamily = 'tactile' | 'ambient'

export const TYPING_CLICK_STYLES: Array<{
  value: TypingClickStyle
  label: string
  blurb: string
  family: ClickFamily
}> = [
  // Tactile — feel like a physical key
  { value: 'soft', label: 'Soft tap', blurb: 'Low gentle thump', family: 'tactile' },
  { value: 'mechanical', label: 'Mechanical', blurb: 'Crisp keyboard click', family: 'tactile' },
  { value: 'typewriter', label: 'Typewriter', blurb: 'Hollow ring with body', family: 'tactile' },
  { value: 'bubble', label: 'Bubble', blurb: 'Playful pop', family: 'tactile' },
  { value: 'marimba', label: 'Marimba', blurb: 'Warm wooden tone', family: 'tactile' },
  // Ambient — low-impact, spacey, breathy, dopamine-coded
  { value: 'whisper', label: 'Whisper', blurb: 'Breathy hush — barely there', family: 'ambient' },
  { value: 'vapor', label: 'Vapor', blurb: 'Air drift with a soft pad bloom', family: 'ambient' },
  { value: 'stardust', label: 'Stardust', blurb: 'Sparkling twinkle, dopamine ping', family: 'ambient' },
  { value: 'crystal', label: 'Crystal', blurb: 'Bell-like shimmer', family: 'ambient' },
  { value: 'halo', label: 'Halo', blurb: 'Pillowy pad swell', family: 'ambient' }
]

export interface SoundPrefs {
  enabled: boolean
  volume: number // 0..1
  typingClick: boolean
  typingClickStyle: TypingClickStyle
  quietWhileWidgetActive: boolean
}

const KEY = 'fb.sound.prefs'

const DEFAULTS: SoundPrefs = {
  enabled: true,
  volume: 0.7,
  typingClick: false,
  typingClickStyle: 'soft',
  quietWhileWidgetActive: false
}

let cached: SoundPrefs = { ...DEFAULTS }
let activeWidgetId: string | null = null
const subscribers = new Set<(p: SoundPrefs) => void>()

function readFromStorage(): SoundPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      volume:
        typeof parsed.volume === 'number'
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULTS.volume,
      typingClick:
        typeof parsed.typingClick === 'boolean' ? parsed.typingClick : DEFAULTS.typingClick,
      typingClickStyle:
        TYPING_CLICK_STYLES.some((s) => s.value === parsed.typingClickStyle)
          ? (parsed.typingClickStyle as TypingClickStyle)
          : DEFAULTS.typingClickStyle,
      quietWhileWidgetActive:
        typeof parsed.quietWhileWidgetActive === 'boolean'
          ? parsed.quietWhileWidgetActive
          : DEFAULTS.quietWhileWidgetActive
    }
  } catch {
    return { ...DEFAULTS }
  }
}

// Initialize from storage on module load
cached = readFromStorage()

export function getSoundPrefs(): SoundPrefs {
  return cached
}

export function setSoundPrefs(patch: Partial<SoundPrefs>): void {
  cached = { ...cached, ...patch }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(cached))
    } catch {
      // ignore quota
    }
  }
  subscribers.forEach((cb) => cb(cached))
}

export function subscribeSoundPrefs(cb: (p: SoundPrefs) => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export function setActiveWidgetForSound(id: string | null): void {
  activeWidgetId = id
}

export function shouldPlay(): boolean {
  if (!cached.enabled) return false
  if (cached.quietWhileWidgetActive && activeWidgetId !== null) return false
  return true
}

export function effectiveVolume(baseVolume: number): number {
  return baseVolume * cached.volume
}
