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
  const rowRef = useRef<HTMLDivElement | null>(null)
  const subRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<number | null>(null)
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null)

  // The submenu now lives in a <body> portal (see below), so hovering off the
  // parent row onto the submenu crosses a DOM gap that would normally fire
  // mouseleave and close it. A short close delay that either side can cancel
  // bridges that gap.
  const cancelClose = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = (): void => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 140)
  }
  useEffect(() => cancelClose, [])

  const hasChildren = !!item.children?.length

  // Position the portalled submenu beside its row, flipping left when opening
  // right would run off-screen and clamping vertically so a long list stays on
  // screen (it scrolls internally past 70vh).
  //
  // Why portal at all: the root menu is `overflow-y-auto` so long catalogs
  // scroll. But a container with overflow-y set forces overflow-x to clip as
  // well, which hid any submenu extending sideways out of the parent (the
  // regression). Portalling each submenu to <body> escapes that clip entirely.
  useLayoutEffect(() => {
    if (!open || !rowRef.current) {
      setSubPos(null)
      return
    }
    const anchor = rowRef.current.getBoundingClientRect()
    const w = subRef.current?.offsetWidth ?? 200
    const h = subRef.current?.offsetHeight ?? 0
    let left = anchor.right - 2
    if (left + w > window.innerWidth - 8) left = Math.max(8, anchor.left - w + 2)
    let top = anchor.top - 5
    if (h && top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
    setSubPos({ left, top })
  }, [open])

  if (item.separator) {
    return <div className="my-1 h-px bg-stone-200 dark:bg-stone-700" />
  }

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => {
        if (hasChildren) {
          cancelClose()
          setOpen(true)
        }
      }}
      onMouseLeave={() => {
        if (hasChildren) scheduleClose()
      }}
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
      {hasChildren &&
        open &&
        createPortal(
          <div
            ref={subRef}
            data-canvas-ctx-menu
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onContextMenu={(e) => e.preventDefault()}
            className="fixed z-[270] bg-white dark:bg-stone-800 rounded-md shadow-2xl border border-stone-200 dark:border-stone-700 py-1 min-w-[190px] max-h-[70vh] overflow-y-auto text-sm"
            style={{
              left: subPos?.left ?? -9999,
              top: subPos?.top ?? -9999,
              // Hidden for the first (unmeasured) frame; useLayoutEffect sets the
              // real position before the browser paints, so there's no flash.
              visibility: subPos ? 'visible' : 'hidden'
            }}
          >
            {item.children?.map((c, i) => (
              <MenuItem key={i} item={c} onSelect={onSelect} />
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
