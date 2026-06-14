import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { computeTooltipPosition, type TooltipPlacement } from '../lib/tooltipPosition'

// Reusable hover/focus tooltip. Dependency-free: a single wrapper span around
// the trigger, a portalled tip positioned from the trigger's rect and clamped
// to the viewport. Shows after a short delay on mouse-enter or keyboard focus,
// hides on leave, blur, Escape, or scroll. Render an empty `content` and it
// transparently passes the child through, so it is safe to wrap unconditionally.
//
// Scope is intentionally small for now (top toolbar + AI controls + footer);
// any other control opts in just by wrapping it in <Tooltip content="...">.

export interface TooltipProps {
  content: ReactNode
  placement?: TooltipPlacement
  delayMs?: number
  // Class for the wrapper span. Defaults to inline-flex so it is layout-neutral
  // around an icon button in a flex row.
  className?: string
  children: ReactNode
}

const GAP = 8

export default function Tooltip({
  content,
  placement = 'bottom',
  delayMs = 350,
  className,
  children
}: TooltipProps): JSX.Element {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
    setOpen(false)
    setPos(null)
  }, [])

  const show = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), delayMs)
  }, [delayMs])

  // Position once the tip has mounted (so we know its real size) and clamp it
  // into the viewport. Runs in a layout effect to avoid a visible jump.
  useLayoutEffect(() => {
    if (!open) return
    const anchorEl = anchorRef.current?.firstElementChild ?? anchorRef.current
    const tipEl = tipRef.current
    if (!anchorEl || !tipEl) return
    const next = computeTooltipPosition(
      anchorEl.getBoundingClientRect(),
      { width: tipEl.offsetWidth, height: tipEl.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      placement,
      GAP
    )
    setPos(next)
  }, [open, placement, content])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') hide() }
    const onScroll = (): void => hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, hide])

  if (content === null || content === undefined || content === false || content === '') {
    return <>{children}</>
  }

  return (
    <span
      ref={anchorRef}
      className={className ?? 'inline-flex'}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="fb-tooltip pointer-events-none fixed z-[1200] max-w-[280px] rounded-md border border-white/10 bg-stone-900/95 px-2.5 py-1.5 text-xs leading-snug text-stone-100 shadow-xl backdrop-blur-sm dark:bg-stone-800/95"
            style={{
              top: pos ? pos.top : -9999,
              left: pos ? pos.left : -9999,
              visibility: pos ? 'visible' : 'hidden'
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  )
}
