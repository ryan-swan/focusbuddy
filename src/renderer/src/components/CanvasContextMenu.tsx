import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

export interface CtxMenuItem {
  label?: string
  icon?: string
  shortcut?: string
  separator?: boolean
  disabled?: boolean
  onClick?: () => void
  children?: CtxMenuItem[]
}

interface Props {
  x: number
  y: number
  items: CtxMenuItem[]
  onClose: () => void
}

export default function CanvasContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    function onMouseDown(e: MouseEvent): void {
      const target = e.target as Element | null
      if (target && !target.closest('[data-canvas-ctx-menu]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Small delay so the right-click that just fired doesn't get caught by the mousedown listener
    const armId = window.setTimeout(() => {
      window.addEventListener('mousedown', onMouseDown)
    }, 50)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
      window.clearTimeout(armId)
    }
  }, [onClose])

  // Portal to document.body so we escape any CSS transform stacking context
  // higher up the tree. position:fixed is computed relative to the nearest
  // transformed ancestor (not the viewport) — for menus opened from widget
  // headers, the ancestor is the canvas's pan+zoomed container, so without
  // portalling the menu lands at a transformed location instead of where
  // the user clicked.
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  // Clamp the menu inside the viewport — right-clicking near the right/bottom
  // edge previously pushed the menu (and any tall submenu) off-screen.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    })
  }, [x, y, items])

  return createPortal(
    <div
      ref={menuRef}
      data-canvas-ctx-menu
      className="fixed z-[260] bg-white dark:bg-stone-800 rounded-md shadow-2xl border border-stone-200 dark:border-stone-700 py-1 min-w-[210px] max-h-[85vh] overflow-y-auto text-sm"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <MenuItem key={i} item={item} onSelect={onClose} />
      ))}
    </div>,
    document.body
  )
}

function MenuItem({ item, onSelect }: { item: CtxMenuItem; onSelect: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const subRef = useRef<HTMLDivElement | null>(null)
  const [flipLeft, setFlipLeft] = useState(false)

  // When the submenu opens, flip it to the LEFT of its parent if opening to the
  // right would run off the viewport (right-click near the right edge). The
  // submenu is also height-capped + scrollable so a long catalog list (the
  // "Add object" menu) never spills below the screen — that was hiding the
  // lower tiles like Diagram / Scratchpad.
  useLayoutEffect(() => {
    if (!open || !subRef.current) return
    const r = subRef.current.getBoundingClientRect()
    setFlipLeft(r.right > window.innerWidth - 8)
  }, [open])

  if (item.separator) {
    return <div className="my-1 h-px bg-stone-200 dark:bg-stone-700" />
  }

  const hasChildren = !!item.children?.length

  return (
    <div
      className="relative"
      onMouseEnter={() => hasChildren && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={
          hasChildren
            ? undefined
            : () => {
                item.onClick?.()
                onSelect()
              }
        }
        disabled={item.disabled}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
          item.disabled ? 'text-stone-400 dark:text-stone-600 cursor-not-allowed' : 'text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700'
        }`}
      >
        {item.icon ? (
          <Icon name={item.icon} size={14} className="text-stone-500 dark:text-stone-400" />
        ) : (
          <span className="w-3.5" />
        )}
        <span className="flex-1 truncate">{item.label}</span>
        {item.shortcut && (
          <span className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">{item.shortcut}</span>
        )}
        {hasChildren && (
          <Icon name="chevron_right" size={14} className="text-stone-500 dark:text-stone-400" />
        )}
      </button>
      {hasChildren && open && (
        <div
          ref={subRef}
          data-canvas-ctx-menu
          className={`absolute top-0 -mt-1 bg-white dark:bg-stone-800 rounded-md shadow-2xl border border-stone-200 dark:border-stone-700 py-1 min-w-[190px] max-h-[70vh] overflow-y-auto ${
            flipLeft ? 'right-full mr-0.5' : 'left-full ml-0.5'
          }`}
        >
          {item.children?.map((c, i) => (
            <MenuItem key={i} item={c} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
