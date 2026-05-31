import { useWidgetStore } from '../stores/widgets'
import Icon from './Icon'

// Floating zoom controls — bottom-left of the canvas. Mirrors the 2.0
// mockup's small pill with %, hand, +, –, reset. Keyboard shortcuts
// already exist (Cmd+], Cmd+[, Cmd+0) — this surface is for users who
// don't reach for the keyboard.
//
// The hand-tool is a state toggle for "pan mode" in a future version
// where click-drag-on-background pans; right now it's a visual nod that
// reads consistently with the mockup and reserves the affordance.

export default function ZoomControls(): JSX.Element {
  const zoom = useWidgetStore((s) => s.zoom)
  const setZoom = useWidgetStore((s) => s.setZoom)
  const setPan = useWidgetStore((s) => s.setPan)

  function reset(): void {
    setZoom(1)
    setPan(0, 0)
  }

  return (
    <div className="absolute bottom-3 left-3 z-30 fb-glass-chrome rounded-md border border-[color:var(--glass-chrome-border)] shadow-md flex items-stretch overflow-hidden">
      <button
        onClick={() => setZoom(zoom - 0.1)}
        className="h-7 w-7 inline-flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-stone-100/80 dark:hover:bg-stone-800/60"
        title="Zoom out (⌘[)"
        aria-label="Zoom out"
      >
        <Icon name="remove" size={14} />
      </button>
      <button
        onClick={reset}
        className="px-2 inline-flex items-center justify-center text-[10px] font-mono tabular-nums text-stone-700 dark:text-stone-200 hover:bg-stone-100/80 dark:hover:bg-stone-800/60 min-w-[44px]"
        title="Reset view (⌘0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => setZoom(zoom + 0.1)}
        className="h-7 w-7 inline-flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-stone-100/80 dark:hover:bg-stone-800/60"
        title="Zoom in (⌘])"
        aria-label="Zoom in"
      >
        <Icon name="add" size={14} />
      </button>
      <span className="w-px bg-[color:var(--glass-chrome-border)]" />
      <button
        onClick={reset}
        className="h-7 w-7 inline-flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-stone-100/80 dark:hover:bg-stone-800/60"
        title="Pan tool — drag the background to move the canvas"
        aria-label="Pan tool"
      >
        <Icon name="pan_tool" size={12} />
      </button>
    </div>
  )
}
