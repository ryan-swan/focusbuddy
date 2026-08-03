import { useEffect, useRef } from 'react'

/**
 * A soft accent-tinted halo that trails the cursor with spring physics.
 * Mounted once at the app root; renders into a fixed-position div above the
 * UI but below modals (z-index 5).
 *
 * Three modes:
 *   - idle (default): small dim glow, low opacity, follows the cursor with
 *     gentle lag (~80ms effective).
 *   - over-interactive: when the cursor is over a button / link / role=button,
 *     the halo expands and brightens, locking to the element's bounds.
 *   - hidden: when the cursor leaves the window, fade out.
 *
 * Pure CSS pointer-events: none — never intercepts clicks.
 *
 * The spotlight is the kind of detail you don't notice until you move to a
 * different app and feel something missing. Linear's marketing site uses
 * the same idea on their CTA buttons.
 */
export default function CursorSpotlight(): JSX.Element {
  const dotRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Honour OS-level motion preferences — the spotlight is decorative motion,
    // exactly the kind of thing reduced-motion users want suppressed. Bail
    // entirely if they've set it; no listeners attached, no rAF loop running.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const dotEl = dotRef.current
    const ringEl = ringRef.current
    if (!dotEl || !ringEl) return
    // Capture as non-null locals so closures don't lose the narrowing across
    // rAF boundaries. TS otherwise widens these back to `... | null` inside
    // tick() because it can't prove the refs haven't been reassigned.
    const dot: HTMLDivElement = dotEl
    const ring: HTMLDivElement = ringEl

    let raf = 0
    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let dotX = targetX
    let dotY = targetY
    let ringX = targetX
    let ringY = targetY
    let dotVisible = false
    let interactiveBounds: DOMRect | null = null
    let idleTimer: number | null = null
    let isOverInteractive = false

    function onMouseMove(e: MouseEvent): void {
      targetX = e.clientX
      targetY = e.clientY
      if (!dotVisible) {
        dotVisible = true
      }
      // Probe the element under the cursor — if it's a button/link/role=button,
      // we'll lock the ring's size + position to its bounds for the "absorbed"
      // pointer effect, and brighten the spotlight to signal interaction.
      // A document-level mousemove can fire with a non-Element target (the
      // document node, or a text node), which has no .closest — guard with an
      // instanceof check so the handler never throws "closest is not a function".
      const target = e.target instanceof Element ? e.target : null
      if (target) {
        const interactive = target.closest(
          'button, a, [role="button"], [data-magnetic="true"]'
        )
        if (interactive) {
          interactiveBounds = interactive.getBoundingClientRect()
          isOverInteractive = true
        } else {
          interactiveBounds = null
          isOverInteractive = false
        }
      }
      // Bright when moving + extra bright over interactive elements; fade to
      // near-invisible when the cursor sits still for >800ms. This keeps the
      // spotlight from being constantly distracting while typing or reading.
      dot.style.opacity = isOverInteractive ? '0.9' : '0.4'
      ring.style.opacity = isOverInteractive ? '0.42' : '0.18'
      if (idleTimer !== null) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        dot.style.opacity = '0'
        ring.style.opacity = '0'
      }, 1200) as unknown as number
    }

    function onMouseLeaveWindow(): void {
      dotVisible = false
      dot.style.opacity = '0'
      ring.style.opacity = '0'
    }

    function tick(): void {
      // Dot — tight follow, ~150ms-effective spring (factor 0.32 per frame).
      dotX += (targetX - dotX) * 0.32
      dotY += (targetY - dotY) * 0.32
      // Ring — looser follow (~280ms-effective, factor 0.16) so there's a
      // visible parallax between the dot and the halo. This is what reads
      // as "physical".
      ringX += (targetX - ringX) * 0.16
      ringY += (targetY - ringY) * 0.16

      dot.style.transform = `translate3d(${dotX.toFixed(2)}px, ${dotY.toFixed(2)}px, 0)`

      if (interactiveBounds) {
        // Absorb mode — ring centers on the element with a bounds-matching
        // size. The 8px padding makes it sit just outside the element.
        const cx = interactiveBounds.left + interactiveBounds.width / 2
        const cy = interactiveBounds.top + interactiveBounds.height / 2
        const w = interactiveBounds.width + 8
        const h = interactiveBounds.height + 8
        ring.style.width = `${w.toFixed(0)}px`
        ring.style.height = `${h.toFixed(0)}px`
        ring.style.transform = `translate3d(${(cx - w / 2).toFixed(2)}px, ${(cy - h / 2).toFixed(2)}px, 0)`
        ring.style.borderRadius = '10px'
      } else {
        // Free mode — circular halo trails the cursor. We use a small
        // 22px diameter so it reads as "subtle accent" not "spotlight".
        ring.style.width = '22px'
        ring.style.height = '22px'
        ring.style.transform = `translate3d(${(ringX - 11).toFixed(2)}px, ${(ringY - 11).toFixed(2)}px, 0)`
        ring.style.borderRadius = '999px'
      }
      // Opacity is owned by onMouseMove (it knows about idle/active/hover).
      // tick() only handles position + size to avoid fighting opacity transitions.

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    document.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('mouseleave', onMouseLeaveWindow)
    return () => {
      cancelAnimationFrame(raf)
      // Clear the idle-fade timer too — without this, a stray setTimeout could
      // fire after unmount and touch style on a detached node.
      if (idleTimer !== null) window.clearTimeout(idleTimer)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeaveWindow)
    }
  }, [])

  return (
    <>
      {/* The ring — soft accent halo, low alpha. mix-blend-mode 'plus-lighter'
          (with a fallback to 'screen' for older Chromium) means it brightens
          whatever's underneath rather than tinting flat. */}
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: 36,
          height: 36,
          borderRadius: 999,
          pointerEvents: 'none',
          zIndex: 5,
          opacity: 0,
          background:
            'radial-gradient(circle at 50% 50%, rgb(var(--accent) / 0.32) 0%, rgb(var(--accent) / 0.10) 50%, rgb(var(--accent) / 0) 70%)',
          mixBlendMode: 'plus-lighter',
          willChange: 'transform, width, height, opacity, border-radius',
          transition: 'opacity 180ms ease, width 220ms cubic-bezier(0.34, 1.56, 0.64, 1), height 220ms cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 220ms ease'
        }}
      />
      {/* The dot — tiny tight indicator. Acts as the cursor's "soul". */}
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: -3,
          top: -3,
          width: 6,
          height: 6,
          borderRadius: 999,
          pointerEvents: 'none',
          zIndex: 5,
          opacity: 0,
          background: 'rgb(var(--accent))',
          boxShadow:
            '0 0 12px rgb(var(--accent) / 0.5), 0 0 24px rgb(var(--accent) / 0.25)',
          willChange: 'transform, opacity',
          transition: 'opacity 180ms ease'
        }}
      />
    </>
  )
}
