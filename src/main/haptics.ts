// Mac haptics bridge. Attempts to load the optional `node-mac-haptics` native module
// at runtime — if it's installed and electron-rebuilt for the current ABI, fires real
// NSHapticFeedbackPerformer events. Otherwise the IPC returns false so the renderer
// can fall back to its audio-tactile substitute.
//
// Install + activate:
//   npm install node-mac-haptics
//   npx electron-rebuild

export type HapticFeel = 'light' | 'medium' | 'success' | 'warning' | 'rigid'

// Matches `node-mac-haptics`' index.d.ts
type MacHapticPattern =
  | 'NSHapticFeedbackPatternLevelChange'
  | 'NSHapticFeedbackPatternAlignment'
  | 'NSHapticFeedbackPatternGeneric'
type MacHapticPerformanceTime =
  | 'NSHapticFeedbackPerformanceTimeDefault'
  | 'NSHapticFeedbackPerformanceTimeDrawCompleted'
  | 'NSHapticFeedbackPerformanceTimeNow'

interface MacHapticsModule {
  performFeedback: (
    pattern: MacHapticPattern,
    performanceTime: MacHapticPerformanceTime
  ) => void
}

let bridge: MacHapticsModule | null = null
let loadAttempted = false

function loadBridge(): MacHapticsModule | null {
  if (loadAttempted) return bridge
  loadAttempted = true
  if (process.platform !== 'darwin') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('node-mac-haptics') as MacHapticsModule
    if (typeof mod.performFeedback !== 'function') {
      bridge = null
      return null
    }
    bridge = mod
    return mod
  } catch {
    // Module not installed, not rebuilt for current Electron ABI, or build failed.
    // Renderer falls back to the audio-tactile substitute automatically.
    bridge = null
    return null
  }
}

export function isHapticsAvailable(): boolean {
  return loadBridge() !== null
}

// Semantic feel → macOS NSHapticFeedbackPattern mapping. macOS only has three patterns,
// so "success" + "warning" both alias to one of them, plus the call site fires the
// appropriate sound chime to differentiate.
function patternFor(feel: HapticFeel): MacHapticPattern {
  switch (feel) {
    case 'success':
      // LevelChange is the "did something settle into a new state" haptic
      return 'NSHapticFeedbackPatternLevelChange'
    case 'warning':
      // Alignment is the firmer of the three
      return 'NSHapticFeedbackPatternAlignment'
    case 'light':
    case 'medium':
    case 'rigid':
    default:
      return 'NSHapticFeedbackPatternGeneric'
  }
}

export function fireHaptic(feel: HapticFeel): boolean {
  const b = loadBridge()
  if (!b) return false
  try {
    b.performFeedback(patternFor(feel), 'NSHapticFeedbackPerformanceTimeDefault')
    return true
  } catch {
    return false
  }
}
