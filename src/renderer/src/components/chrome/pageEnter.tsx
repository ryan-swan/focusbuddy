import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

// The unraveling, app-wide. Home earned a staged, springy entrance (widgets
// cascade in on first paint); every other page rendered cold. This is the
// shared page-level treatment: each navigation rises the incoming view into
// place with the same spring vocabulary Home's grid uses (stiffness 420,
// damping 34 — see HomeDashboard's entrance transitions), so switching views
// feels like one product everywhere.
//
// Composition rules:
// - Key `id` on the navigation identity so the entrance replays per
//   navigation, not per re-render.
// - Home opts out (it runs its own richer widget cascade; stacking a page
//   rise under it would double the motion).
// - Transform + opacity only, spring-driven, honoring reduced motion — per
//   the Apple doctrine (R3.1, R3.4).

export const PAGE_ENTER_SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const

export default function PageEnter({
  id,
  children,
  className = 'h-full min-h-0',
  testid
}: {
  // Navigation identity: a new id remounts the wrapper and replays the enter.
  id: string
  children: ReactNode
  className?: string
  testid?: string
}): JSX.Element {
  const reduced = useReducedMotion()
  return (
    <motion.div
      key={id}
      className={className}
      data-testid={testid}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0.12 }
          : { opacity: { duration: 0.25 }, y: PAGE_ENTER_SPRING }
      }
    >
      {children}
    </motion.div>
  )
}
