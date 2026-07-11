import { create } from 'zustand'

// Minimal shared signal so surfaces outside VoiceCommandFAB (e.g. UnifiedBottomBar)
// can react to whether voice mode is currently active without prop-drilling.

interface VoicePhaseState {
  phase: 'idle' | 'listening' | 'staged' | 'sending' | 'result' | 'error'
  setPhase: (phase: VoicePhaseState['phase']) => void
}

export const useVoicePhaseStore = create<VoicePhaseState>((set) => ({
  phase: 'idle',
  setPhase: (phase) => set({ phase })
}))
