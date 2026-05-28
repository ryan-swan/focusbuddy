// Theme switching ritual — the moment of changing themes becomes a beat.
//
// Two layers play together when applyTheme is called:
//   1. A full-window veil fades in (240ms ease-out), the theme actually
//      switches under cover of the veil, then the veil fades out (480ms
//      ease-in). The user never sees the harsh mid-transition flash.
//   2. An accent-colored ripple expands from the click point (or screen
//      center if no click was captured) over 520ms. The ripple uses the
//      INCOMING theme's accent so the eye is led toward the new identity.
//
// We expose `themeRitualOrigin` as a one-shot — the SettingsPanel sets it
// before calling setMode/setAccent; the ritual reads + clears it. This
// avoids threading mouse-event refs through the theme hook.

interface RitualOrigin {
  x: number
  y: number
}

let pendingOrigin: RitualOrigin | null = null

export function captureRitualOrigin(e: { clientX: number; clientY: number }): void {
  pendingOrigin = { x: e.clientX, y: e.clientY }
}

function takeOrigin(): RitualOrigin {
  if (pendingOrigin) {
    const o = pendingOrigin
    pendingOrigin = null
    return o
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

let ritualRoot: HTMLDivElement | null = null

function ensureRitualRoot(): HTMLDivElement {
  if (ritualRoot && ritualRoot.isConnected) return ritualRoot
  const el = document.createElement('div')
  el.id = 'fb-theme-ritual-root'
  el.style.position = 'fixed'
  el.style.inset = '0'
  el.style.pointerEvents = 'none'
  el.style.zIndex = '9998'
  document.body.appendChild(el)
  ritualRoot = el
  return el
}

/**
 * Play the theme-switching ritual around the act of actually applying the
 * theme. The caller passes `apply` as a callback so we can sandwich the
 * theme change between the veil-in and veil-out — eliminating the mid-
 * transition flash that always looks cheap.
 */
export function playThemeRitual(apply: () => void): void {
  if (typeof document === 'undefined') {
    apply()
    return
  }
  // Respect the user's reduced-motion preference — premium apps don't
  // override accessibility for flair.
  if (
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply()
    return
  }

  const root = ensureRitualRoot()
  const origin = takeOrigin()

  // ── Layer 1: full-window cross-fade veil ──────────────────────────────
  const veil = document.createElement('div')
  veil.style.position = 'absolute'
  veil.style.inset = '0'
  veil.style.background = 'oklch(50% 0.005 264)'
  veil.style.opacity = '0'
  veil.style.transition = 'opacity 240ms cubic-bezier(0.32, 0.72, 0, 1)'
  root.appendChild(veil)

  // ── Layer 2: accent-colored ripple from the click point ───────────────
  // We compute the maximum radius needed to cover the window from the
  // origin so the ripple definitely reaches every edge.
  const w = window.innerWidth
  const h = window.innerHeight
  const maxR = Math.hypot(
    Math.max(origin.x, w - origin.x),
    Math.max(origin.y, h - origin.y)
  )
  const ripple = document.createElement('div')
  ripple.style.position = 'absolute'
  ripple.style.left = `${origin.x}px`
  ripple.style.top = `${origin.y}px`
  ripple.style.width = '0px'
  ripple.style.height = '0px'
  ripple.style.borderRadius = '999px'
  ripple.style.transform = 'translate(-50%, -50%)'
  ripple.style.background =
    'radial-gradient(circle, rgb(var(--accent) / 0.45) 0%, rgb(var(--accent) / 0.20) 40%, rgb(var(--accent) / 0) 70%)'
  ripple.style.opacity = '0'
  ripple.style.transition =
    'width 720ms cubic-bezier(0.22, 1, 0.36, 1), height 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 720ms cubic-bezier(0.22, 1, 0.36, 1)'
  root.appendChild(ripple)

  // Start the ripple immediately — runs in parallel with the veil.
  requestAnimationFrame(() => {
    ripple.style.width = `${maxR * 2.4}px`
    ripple.style.height = `${maxR * 2.4}px`
    ripple.style.opacity = '1'
    veil.style.opacity = '0.25'
  })

  // Sandwich the actual theme change inside the veil's peak. The user sees
  // the room dim, then re-emerge already in the new theme.
  window.setTimeout(() => {
    apply()
  }, 180)

  // Fade everything back to nothing.
  window.setTimeout(() => {
    veil.style.transition = 'opacity 480ms cubic-bezier(0.22, 1, 0.36, 1)'
    veil.style.opacity = '0'
    ripple.style.opacity = '0'
  }, 320)

  // Clean up the DOM after the longest animation finishes.
  window.setTimeout(() => {
    veil.remove()
    ripple.remove()
  }, 1100)
}
