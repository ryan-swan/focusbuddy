import { useEffect, useRef } from 'react'

/**
 * Magnetic hover effect — when the cursor enters a small "field" around an
 * interactive element, the element subtly translates toward the cursor (max
 * ~6px) with spring physics. Releases on mouse-leave.
 *
 * The trick reads as a high-end UI signal because most apps don't do it —
 * Linear, Vercel, Arc use it on primary CTAs. We use it on the buttons that
 * appear in critical workflows: primary CTAs in modals, the "Just 5 min"
 * button, the Build with AI button.
 *
 * Performance: a single mousemove listener bound while hovering, no listener
 * at rest. Cleanup on unmount cancels any in-flight rAF.
 *
 * @param strength how far the element travels at maximum, in pixels (default 5)
 * @param fieldExpand how far the magnetic field extends past the element,
 *   in pixels (default 14). Larger = element starts moving from further away.
 */
export function useMagneticHover<T extends HTMLElement>(
  strength = 5,
  fieldExpand = 14
): React.RefObject<T> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let raf = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    function onMouseMove(e: MouseEvent): void {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      // How far (0..1) the cursor is from center along each axis, scaled to a
      // max field that extends past the element's bounds by fieldExpand.
      const dx = (e.clientX - cx) / (rect.width / 2 + fieldExpand)
      const dy = (e.clientY - cy) / (rect.height / 2 + fieldExpand)
      targetX = Math.max(-1, Math.min(1, dx)) * strength
      targetY = Math.max(-1, Math.min(1, dy)) * strength
    }

    function tick(): void {
      // Critically-damped lerp — feels springy without overshoot. The 0.18
      // factor sets the spring's stiffness; lower = mushier, higher = snappier.
      currentX += (targetX - currentX) * 0.18
      currentY += (targetY - currentY) * 0.18
      if (ref.current) {
        ref.current.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }

    function onMouseEnter(): void {
      window.addEventListener('mousemove', onMouseMove)
      if (!raf) raf = requestAnimationFrame(tick)
    }

    function onMouseLeave(): void {
      window.removeEventListener('mousemove', onMouseMove)
      targetX = 0
      targetY = 0
      // Let the spring settle back to 0,0 over ~12 frames, then stop the loop.
      setTimeout(() => {
        cancelAnimationFrame(raf)
        raf = 0
        if (ref.current) ref.current.style.transform = ''
      }, 220)
    }

    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)

    return () => {
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(raf)
    }
  }, [strength, fieldExpand])

  return ref
}
