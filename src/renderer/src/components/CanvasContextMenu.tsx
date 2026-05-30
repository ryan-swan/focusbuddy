import { useEffect, useState } from 'react'
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
  return createPortal(
    <div
      data-canvas-ctx-menu
      className="fixed z-[260] bg-white dark:bg-stone-800 rounded-md shadow-2xl border border-stone-200 dark:border-stone-700 py-1 min-w-[210px] text-sm"
      style={{ left: x, top: y }}
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
          data-canvas-ctx-menu
          className="absolute left-full top-0 -mt-1 ml-0.5 bg-white dark:bg-stone-800 rounded-md shadow-2xl border border-stone-200 dark:border-stone-700 py-1 min-w-[190px]"
        >
          {item.children?.map((c, i) => (
            <MenuItem key={i} item={c} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
