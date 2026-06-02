import { useEffect, useState } from 'react'

interface EdgeIntensity {
  top: number
  right: number
  bottom: number
  left: number
}

interface Props {
  intensity: EdgeIntensity
  // Whether to render at all. False during focus mode / widget editing
  // so we don't paint distracting halos when the user isn't navigating.
  visible: boolean
}

// Four subtle violet glow bars hugging each edge of the canvas. Each
// edge's brightness scales with the live mouse-edge intensity from
// useEdgePan. Idle state still shows a hairline so the user discovers
// the affordance — "this edge does something" — without it being loud.
//
// Pure presentation; the rAF pan loop lives in useEdgePan. These
// indicators are pointer-events: none so they never block mouse
// interaction with the canvas underneath.

export default function CanvasEdgeIndicators({ intensity, visible }: Props): JSX.Element | null {
  // Slow breathing pulse so the idle hairline isn't static — telegraphs
  // "this is interactive". The phase is shared between all four edges.
  const [breathPhase, setBreathPhase] = useState(0)
  useEffect(() => {
    if (!visible) return
    let raf = 0
    const start = performance.now()
    function tick(): void {
      const now = performance.now()
      // 5.5s cycle, sine wave 0 → 1.
      const t = ((now - start) / 5500) % 1
      setBreathPhase(0.5 + 0.5 * Math.sin(t * Math.PI * 2))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible])

  if (!visible) return null

  // Idle alpha is a faint hairline (~3-5% peak). Active alpha ramps to
  // a bright violet halo at the cursor's edge. We blend the two so:
  //   - far from edge:    breathing hairline
  //   - approaching:      brighter halo
  //   - at edge:          full violet glow
  const idleAlpha = 0.03 + breathPhase * 0.025

  return (
    <>
      <EdgeBar side="top" intensity={intensity.top} idleAlpha={idleAlpha} />
      <EdgeBar side="right" intensity={intensity.right} idleAlpha={idleAlpha} />
      <EdgeBar side="bottom" intensity={intensity.bottom} idleAlpha={idleAlpha} />
      <EdgeBar side="left" intensity={intensity.left} idleAlpha={idleAlpha} />
    </>
  )
}

function EdgeBar({
  side,
  intensity,
  idleAlpha
}: {
  side: 'top' | 'right' | 'bottom' | 'left'
  intensity: number
  idleAlpha: number
}): JSX.Element {
  // Combine idle breath + active intensity. Active intensity dominates
  // when the user is actively in the zone; idle takes over otherwise.
  const liveAlpha = Math.max(idleAlpha, 0.04 + intensity * 0.34)
  // The brighter the cursor approach, the wider the glow gets — gives
  // a sense of acceleration before the camera even moves significantly.
  const thickness = 56 + intensity * 24
  const isHorizontal = side === 'top' || side === 'bottom'

  // Gradient direction goes FROM the edge AWAY into the canvas, so the
  // brightest pixel is right at the edge and the glow fades inward.
  const gradient =
    side === 'top'
      ? `linear-gradient(180deg, rgba(139,92,246,${liveAlpha}) 0%, rgba(139,92,246,${liveAlpha * 0.6}) 30%, transparent 100%)`
      : side === 'bottom'
        ? `linear-gradient(0deg, rgba(139,92,246,${liveAlpha}) 0%, rgba(139,92,246,${liveAlpha * 0.6}) 30%, transparent 100%)`
        : side === 'left'
          ? `linear-gradient(90deg, rgba(139,92,246,${liveAlpha}) 0%, rgba(139,92,246,${liveAlpha * 0.6}) 30%, transparent 100%)`
          : `linear-gradient(270deg, rgba(139,92,246,${liveAlpha}) 0%, rgba(139,92,246,${liveAlpha * 0.6}) 30%, transparent 100%)`

  const positionStyle: React.CSSProperties =
    side === 'top'
      ? { top: 0, left: 0, right: 0, height: thickness }
      : side === 'bottom'
        ? { bottom: 0, left: 0, right: 0, height: thickness }
        : side === 'left'
          ? { top: 0, left: 0, bottom: 0, width: thickness }
          : { top: 0, right: 0, bottom: 0, width: thickness }

  // When the edge is actively engaged we add a thin inner highlight
  // line right against the boundary so the eye can locate "I am here".
  const showInnerLine = intensity > 0.15
  const innerLineStyle: React.CSSProperties =
    side === 'top'
      ? { top: 0, left: 0, right: 0, height: 1 }
      : side === 'bottom'
        ? { bottom: 0, left: 0, right: 0, height: 1 }
        : side === 'left'
          ? { top: 0, left: 0, bottom: 0, width: 1 }
          : { top: 0, right: 0, bottom: 0, width: 1 }

  void isHorizontal // reserved for future horizontal-only motion if needed

  return (
    <>
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          ...positionStyle,
          background: gradient,
          transition: 'height 240ms ease, width 240ms ease',
          zIndex: 22
        }}
      />
      {showInnerLine && (
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            ...innerLineStyle,
            background: `rgba(196, 181, 253, ${0.35 + intensity * 0.4})`,
            boxShadow: `0 0 12px rgba(139, 92, 246, ${0.4 + intensity * 0.4})`,
            zIndex: 23
          }}
        />
      )}
    </>
  )
}
