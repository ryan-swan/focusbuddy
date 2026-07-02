import { useEffect, useRef, useState } from 'react'
import Icon from '../../Icon'

// Shared presentation for the Google-Docs-style menu bars used across the office
// editors (documents, sheets, slides). It owns only the dropdown chrome and
// open/close behaviour; each editor supplies its own menu definitions whose items
// are wired to that editor's real commands. Nothing here invents an action.

export type MenuItem =
  | { kind: 'item'; label: string; shortcut?: string; icon?: string; run: () => void; disabled?: boolean; active?: boolean }
  | { kind: 'sep' }
  | { kind: 'submenu'; label: string; icon?: string; items: MenuItem[] }

export interface MenuDef {
  id: string
  label: string
  build: () => MenuItem[]
}

export function MenuBarShell({ menus, testid }: { menus: MenuDef[]; testid: string }): JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    function onDoc(e: MouseEvent): void {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  function runItem(run: () => void): void {
    setOpenMenu(null)
    run()
  }

  return (
    <div ref={barRef} className="relative flex items-center gap-0.5 select-none" data-testid={testid}>
      {menus.map((menu) => (
        <div key={menu.id} className="relative">
          <button
            onClick={() => setOpenMenu((cur) => (cur === menu.id ? null : menu.id))}
            onMouseEnter={() => setOpenMenu((cur) => (cur ? menu.id : cur))}
            data-testid={`${testid}-${menu.id}`}
            className={`px-2 py-0.5 rounded text-[13px] text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 ${
              openMenu === menu.id ? 'bg-stone-100 dark:bg-stone-800' : ''
            }`}
          >
            {menu.label}
          </button>
          {openMenu === menu.id && (
            <MenuDropdown items={menu.build()} onRun={runItem} testid={`${testid}-${menu.id}-list`} />
          )}
        </div>
      ))}
    </div>
  )
}

function MenuDropdown({
  items,
  onRun,
  testid
}: {
  items: MenuItem[]
  onRun: (run: () => void) => void
  testid?: string
}): JSX.Element {
  return (
    <div
      className="absolute left-0 top-full mt-0.5 z-40 min-w-[230px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1"
      data-testid={testid}
    >
      {items.map((it, i) => {
        if (it.kind === 'sep') return <div key={i} className="my-1 border-t border-stone-100 dark:border-stone-800" />
        if (it.kind === 'submenu') return <SubmenuRow key={i} label={it.label} icon={it.icon} items={it.items} onRun={onRun} />
        return (
          <button
            key={i}
            onClick={() => !it.disabled && onRun(it.run)}
            disabled={it.disabled}
            className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-left ${
              it.disabled
                ? 'text-stone-300 dark:text-stone-600 cursor-default'
                : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <span className="w-4 shrink-0 text-stone-500 dark:text-stone-400">
              {it.active ? <Icon name="check" size={15} /> : it.icon ? <Icon name={it.icon} size={15} /> : null}
            </span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && <span className="text-[11px] text-stone-400 dark:text-stone-500 fb-tabular">{it.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}

function SubmenuRow({
  label,
  icon,
  items,
  onRun
}: {
  label: string
  icon?: string
  items: MenuItem[]
  onRun: (run: () => void) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-left text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800">
        <span className="w-4 shrink-0 text-stone-500 dark:text-stone-400">{icon ? <Icon name={icon} size={15} /> : null}</span>
        <span className="flex-1 truncate">{label}</span>
        <Icon name="chevron_right" size={15} className="text-stone-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-full top-0 -mt-1 ml-0.5 z-50 min-w-[210px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1">
          {items.map((it, i) => {
            if (it.kind !== 'item') return null
            return (
              <button
                key={i}
                onClick={() => !it.disabled && onRun(it.run)}
                disabled={it.disabled}
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-left ${
                  it.disabled
                    ? 'text-stone-300 dark:text-stone-600 cursor-default'
                    : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <span className="w-4 shrink-0 text-stone-500 dark:text-stone-400">{it.active ? <Icon name="check" size={15} /> : null}</span>
                <span className="flex-1 truncate">{it.label}</span>
                {it.shortcut && <span className="text-[11px] text-stone-400 dark:text-stone-500 fb-tabular">{it.shortcut}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function MenuModal({
  title,
  children,
  onClose
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div
        className="w-[340px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-stone-800 dark:text-stone-100">{title}</h3>
          <button onClick={onClose} className="icon-btn" title="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
