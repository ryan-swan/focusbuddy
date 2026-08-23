import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVoicePhaseStore } from '../stores/voicePhase'
import VoiceCommandFAB from './VoiceCommandFAB'

// Hover mic bar — collapses to a thin accent strip; hover reveals the voice FAB.
// The widget tray that previously lived here has been removed.
export default function UnifiedBottomBar(): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<number | null>(null)

  const voicePhase = useVoicePhaseStore((s) => s.phase)
  const voiceActive = voicePhase !== 'idle'

  const wasVoiceActiveRef = useRef(false)
  useEffect(() => {
    if (voiceActive) {
      wasVoiceActiveRef.current = true
      if (leaveTimer.current !== null) {
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = null
      }
      setHovered(true)
    } else if (wasVoiceActiveRef.current) {
      wasVoiceActiveRef.current = false
      leaveTimer.current = window.setTimeout(() => setHovered(false), 1200)
    }
  }, [voiceActive])

  function enter(): void {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHovered(true)
  }

  function leave(): void {
    if (voiceActive) return
    leaveTimer.current = window.setTimeout(() => setHovered(false), 320)
  }

  return (
    <div
      className="flex flex-col items-center pointer-events-auto"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onWheel={(e) => e.stopPropagation()}
    >
      <AnimatePresence mode="wait" initial={false}>
        {hovered ? (
          <motion.div
            key="dock"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            // Floating chrome over the canvas: the chrome glass tier (Edges +
            // Glass), its rim from the tier's border, elevation from the token
            // shadow. The accent ring is state (voice live), never decoration.
            className={`rounded-[var(--radius-card)] fb-glass-chrome border shadow-[var(--shadow-deep)] transition-shadow duration-300 ${
              voiceActive ? 'ring-1 ring-[rgb(var(--accent)/0.3)]' : ''
            }`}
          >
            <div className="flex items-center justify-center px-3 py-2 relative overflow-visible">
              <VoiceCommandFAB embedded />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="strip"
            initial={{ opacity: 0, scaleX: 0.5 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.5 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="rounded-full cursor-pointer"
            style={{ width: 120, height: 4, background: 'rgb(var(--accent) / 0.35)' }}
            onMouseEnter={enter}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
