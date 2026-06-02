import { useEffect, useState } from 'react'

// Shared UI-chrome state.
//
// Multiple components (Canvas, AI rail, pinned-layer position math) need
// to know "is the AI rail expanded right now?" so the rail's 280px panel
// doesn't overlap zone-pinned widgets like the minimap. Rather than
// thread the boolean through props (the rail is mounted under a
// runtime-evaluated IIFE deep in Canvas.tsx) we keep it in localStorage +
// publish a window CustomEvent on change. Subscribers re-render
// instantly; new tabs / new sessions inherit the persisted preference.

export const AI_RAIL_LS_KEY = 'fb.ai-rail.collapsed'
const AI_RAIL_EVENT = 'fb:ai-rail-changed'

function readCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(AI_RAIL_LS_KEY) === '1'
}

/** Update the rail's collapsed state and notify all subscribers. */
export function setAIRailCollapsed(collapsed: boolean): void {
  if (collapsed) {
    localStorage.setItem(AI_RAIL_LS_KEY, '1')
  } else {
    localStorage.removeItem(AI_RAIL_LS_KEY)
  }
  window.dispatchEvent(new CustomEvent(AI_RAIL_EVENT))
}

/** Read the rail's collapsed state and re-render on change. */
export function useAIRailCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed())
  useEffect(() => {
    function onChange(): void {
      setCollapsed(readCollapsed())
    }
    window.addEventListener(AI_RAIL_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(AI_RAIL_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return collapsed
}

// AI rail dimensions — kept in this module so the pinned-layer maths and
// the rail itself agree on the magic numbers without anyone hardcoding.
export const AI_RAIL_WIDTH = 280
export const AI_RAIL_RIGHT_OFFSET = 12 // matches `right-3` on the <aside>
export const AI_RAIL_BUTTON_SIZE = 32 // collapsed button (8 × 8 grid → 32px)
