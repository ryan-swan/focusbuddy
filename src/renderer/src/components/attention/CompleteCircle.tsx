import Icon from '../Icon'

// DEC-077 — the ONE completion circle. The queue's form factor (DEC-050) is
// the reference the operator approved: an outlined circle whose check appears
// and fills green as you commit. Every surface that can complete an item —
// the Attention queue, the Calendar rail, blocks on the grid, the widget
// header — renders THIS, so the affordance cannot drift per surface
// (DEC-051's one-renderer rule, applied to completion).
//
// It swallows mousedown/pointerdown/dblclick because every host is also a
// gesture surface (rnd drag handle, grid block drag, draggable rows, the
// double-click-to-edit rows) — a completion click must never start a drag or
// open an editor. data-row-action keeps it inside the queue's action-cluster
// double-click guard.

export default function CompleteCircle({
  onClick,
  title,
  size = 18,
  className = '',
  dataTestId
}: {
  onClick: () => void
  title: string
  size?: number
  className?: string
  dataTestId?: string
}): JSX.Element {
  return (
    <button
      data-row-action
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      title={title}
      aria-label={title}
      data-testid={dataTestId}
      style={{ height: size, width: size }}
      className={`shrink-0 rounded-full border-[1.5px] border-[var(--ink-30)] text-transparent flex items-center justify-center fb-press transition-colors hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 ${className}`}
    >
      <Icon name="check" size={Math.max(9, Math.round(size * 0.72))} />
    </button>
  )
}
