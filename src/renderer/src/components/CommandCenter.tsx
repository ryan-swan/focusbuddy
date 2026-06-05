import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { useWidgetStore } from '../stores/widgets'
import type { WidgetKind } from '@shared/types'
import { WIDGET_CATALOG } from '../lib/widgetCatalog'
import Icon from './Icon'
import { useCapabilityEnabled, useCapabilityStore } from '../stores/capabilities'
import { canCreateWidget } from '../lib/gating'
import { promptUpgrade } from '../stores/upgradePrompt'

interface Props {
  onOpenBodyDouble: () => void
  onOpenSmartStack: () => void
  canSmartStack: boolean
}

interface PillAction {
  id: string
  icon: string
  label: string
  title: string
  disabled?: boolean
  onClick: () => void
}

interface CommandResult {
  id: string
  label: string
  hint: string
  icon: string
  // 'jump' = navigate to a node, 'action' = run a function.
  kind: 'jump' | 'action'
  // Score for ranking — higher is better.
  score: number
  run: () => void
}

// Floating Command Center — a bottom-centred pill with the most-used
// actions. Expands into a full command palette on Cmd+K (also clickable
// by the magnifier icon). Mirrors actions already in the chrome — it's
// additive, not a replacement. Closing it never breaks an existing flow.
//
// Why a separate component:
//  - Cmd+K should work from anywhere in the app, including dialogs that
//    aren't aware of the chrome.
//  - The pill stays visible at all times as a low-friction reminder that
//    these actions exist — onboarding has a lot to teach, this surface
//    reinforces it constantly without lecturing.
//
// Palette ranking is simple substring + recency. No vector search, no AI —
// this surface needs to be instant, not clever.
export default function CommandCenter({
  onOpenBodyDouble,
  onOpenSmartStack,
  canSmartStack
}: Props): JSX.Element {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const bodyDoubleEnabled = useCapabilityEnabled('body_double')
  const caps = useCapabilityStore((s) => s.capabilities)

  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goHome = useViewStore((s) => s.goHome)
  const goAllTasks = useViewStore((s) => s.goAllTasks)
  const goCalendar = useViewStore((s) => s.goCalendar)
  const goVault = useViewStore((s) => s.goVault)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const view = useViewStore((s) => s.view)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const setZoom = useWidgetStore((s) => s.setZoom)
  const setPan = useWidgetStore((s) => s.setPan)
  const createWidget = useWidgetStore((s) => s.create)

  // The pill's middle buttons swap based on what the user is doing.
  // - On the canvas (kind === 'task'): widget-creation shortcuts that
  //   mirror the most-used catalog kinds. Closest match to the 2.0 mockup's
  //   "Note · Browser · Table · Board · Timer · Whiteboard · Calculator".
  // - Elsewhere (home, project dashboard, etc.): action-shortcuts that
  //   make sense without a canvas — New, Body double, Smart Stack.
  // All actions are also reachable from the palette and chrome, so the
  // pill is a convenience, never the only path.
  const contextActions = useMemo<PillAction[]>(() => {
    if (view.kind === 'task' && activeTaskId) {
      // Build a quick widget at a sensible position on the active task.
      function spawn(kind: WidgetKind): () => void {
        return () => {
          // Same matrix gate as the widget palette — a Pro-only widget kind
          // (e.g. table on Free) opens the upgrade prompt instead of creating.
          if (!canCreateWidget(caps, kind)) {
            promptUpgrade(`The ${kind} widget is a Pro feature.`)
            return
          }
          const entry = WIDGET_CATALOG.find((e) => e.kind === kind)
          void createWidget({
            taskId: activeTaskId!,
            kind,
            title: '',
            content: entry?.defaultContent || '',
            x: 80 + Math.round(Math.random() * 120),
            y: 80 + Math.round(Math.random() * 80),
            width: entry?.defaultWidth ?? 320,
            height: entry?.defaultHeight ?? 240,
            color: kind === 'sticky' ? '#fef08a' : null
          })
        }
      }
      return [
        { id: 'w-note', icon: 'sticky_note_2', label: 'Note', title: 'Add a sticky note', onClick: spawn('sticky') },
        { id: 'w-page', icon: 'description', label: 'Page', title: 'Add a Page widget', onClick: spawn('page') },
        { id: 'w-table', icon: 'table_chart', label: 'Table', title: 'Add a table', onClick: spawn('table') },
        { id: 'w-web', icon: 'public', label: 'Web', title: 'Add a browser widget', onClick: spawn('webview') },
        { id: 'w-timer', icon: 'hourglass_empty', label: 'Timer', title: 'Add a timer widget', onClick: spawn('timer') },
        { id: 'w-calc', icon: 'calculate', label: 'Calc', title: 'Add a calculator', onClick: spawn('calculator') }
      ]
    }
    // Default (home / dashboard / all-tasks / etc.)
    return [
      {
        id: 'a-new',
        icon: 'add',
        label: 'New',
        title: 'New folder / task',
        onClick: () => window.dispatchEvent(new CustomEvent('fb:command-new-task'))
      },
      {
        id: 'a-pair',
        icon: 'diversity_3',
        label: 'Pair',
        title: bodyDoubleEnabled
          ? 'Find a body double'
          : 'Body double matching is a Pro feature — upgrade or ask admin to enable.',
        disabled: !bodyDoubleEnabled,
        onClick: onOpenBodyDouble
      },
      {
        id: 'a-stack',
        icon: 'hub',
        label: 'Stack',
        title: canSmartStack ? 'Smart Stack widgets' : 'Need an active task with 3+ widgets',
        disabled: !canSmartStack,
        onClick: onOpenSmartStack
      }
    ]
  }, [view, activeTaskId, createWidget, canSmartStack, onOpenBodyDouble, onOpenSmartStack, bodyDoubleEnabled, caps])

  function openPalette(): void {
    setPaletteOpen(true)
    setQuery('')
    setHighlightIdx(0)
  }
  function closePalette(): void {
    setPaletteOpen(false)
  }

  // Cmd+K from anywhere — open palette. Cmd+Shift+K = body double quick
  // launch. Esc inside palette = close.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (paletteOpen) closePalette()
        else openPalette()
        return
      }
      if (paletteOpen && e.key === 'Escape') {
        e.preventDefault()
        closePalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

  useEffect(() => {
    if (paletteOpen) {
      // Defer to next tick so the portal mounts before focusing.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [paletteOpen])

  const results = useMemo<CommandResult[]>(() => {
    const q = query.trim().toLowerCase()
    const items: CommandResult[] = []

    // Static actions
    items.push({
      id: 'go-home',
      label: 'Go to Home',
      hint: 'Dashboard',
      icon: 'dashboard',
      kind: 'action',
      score: q === '' ? 90 : matchScore('home dashboard', q),
      run: () => {
        setActive(null)
        goHome()
        closePalette()
      }
    })
    items.push({
      id: 'go-all-tasks',
      label: 'All tasks',
      hint: 'Browse + filter every task',
      icon: 'checklist',
      kind: 'action',
      score: q === '' ? 85 : matchScore('all tasks list', q),
      run: () => {
        setActive(null)
        goAllTasks()
        closePalette()
      }
    })
    items.push({
      id: 'go-calendar',
      label: 'Calendar',
      hint: 'Tasks by date',
      icon: 'calendar_month',
      kind: 'action',
      score: q === '' ? 70 : matchScore('calendar schedule', q),
      run: () => {
        setActive(null)
        goCalendar()
        closePalette()
      }
    })
    items.push({
      id: 'go-vault',
      label: 'Vault',
      hint: 'Encrypted credentials',
      icon: 'lock',
      kind: 'action',
      score: q === '' ? 60 : matchScore('vault credentials passwords', q),
      run: () => {
        setActive(null)
        goVault()
        closePalette()
      }
    })
    items.push({
      id: 'body-double',
      label: 'Find a body double',
      hint: 'Pair with someone to focus together',
      icon: 'diversity_3',
      kind: 'action',
      score: q === '' ? 75 : matchScore('body double pair partner focus together', q),
      run: () => {
        onOpenBodyDouble()
        closePalette()
      }
    })
    if (canSmartStack) {
      items.push({
        id: 'smart-stack',
        label: 'Smart Stack',
        hint: 'Group widgets into sections by AI',
        icon: 'hub',
        kind: 'action',
        score: q === '' ? 65 : matchScore('smart stack group sections AI', q),
        run: () => {
          onOpenSmartStack()
          closePalette()
        }
      })
    }
    if (activeTaskId) {
      items.push({
        id: 'reset-view',
        label: 'Reset canvas view',
        hint: 'Zoom 100%, pan 0,0',
        icon: 'crop_free',
        kind: 'action',
        score: q === '' ? 50 : matchScore('reset zoom view canvas pan', q),
        run: () => {
          setZoom(1)
          setPan(0, 0)
          closePalette()
        }
      })
    }

    // Dynamic — every folder + task. Capped at 60 entries so giant
    // workspaces don't slow the palette.
    let added = 0
    for (const n of nodes) {
      if (n.archived) continue
      if (added >= 60) break
      const isFolder = n.kind === 'folder'
      const haystack = `${n.title || ''} ${isFolder ? 'folder project' : 'task'}`.toLowerCase()
      const score = q === '' ? 30 : matchScore(haystack, q)
      if (score <= 0 && q !== '') continue
      items.push({
        id: `node-${n.id}`,
        label: n.title || (isFolder ? '(untitled folder)' : '(untitled task)'),
        hint: isFolder ? 'Open folder' : 'Open task',
        icon: isFolder ? 'folder' : 'task_alt',
        kind: 'jump',
        score: score + (n.kind === 'task' && n.status !== 'done' ? 5 : 0),
        run: () => {
          if (isFolder) goProject(n.id)
          else {
            setActive(n.id)
            goTask(n.id)
          }
          closePalette()
        }
      })
      added++
    }

    return items
      .filter((i) => (q === '' ? true : i.score > 0))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
  }, [
    query,
    nodes,
    canSmartStack,
    activeTaskId,
    onOpenBodyDouble,
    onOpenSmartStack,
    setActive,
    goHome,
    goAllTasks,
    goCalendar,
    goVault,
    goTask,
    goProject,
    setZoom,
    setPan
  ])

  // Clamp highlight within results length whenever the list changes.
  useEffect(() => {
    if (highlightIdx >= results.length) setHighlightIdx(Math.max(0, results.length - 1))
  }, [results.length, highlightIdx])

  function paletteKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[highlightIdx]
      if (r) r.run()
    }
  }

  return (
    <>
      {/* Pinned pill — bottom-centre. Always visible. Lives in a portal so
          its z-index isn't trapped by panels' stacking context. */}
      {createPortal(
        <div
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[120] fb-glass-chrome rounded-full border border-[color:var(--glass-chrome-border)] shadow-lg flex items-center gap-0.5 px-1.5 py-1"
          role="toolbar"
          aria-label="Quick actions"
        >
          <button
            onClick={openPalette}
            className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full hover:bg-stone-100/80 dark:hover:bg-stone-800/60 text-[12px] text-stone-700 dark:text-stone-200"
            title="Open command palette (⌘K)"
          >
            <Icon name="search" size={13} className="text-stone-500" />
            <span>Search · ⌘K</span>
          </button>
          <span className="w-px h-4 bg-stone-300/60 dark:bg-stone-600/60" />
          {contextActions.map((a) => (
            <PillButton
              key={a.id}
              icon={a.icon}
              label={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.title}
            />
          ))}
        </div>,
        document.body
      )}

      {/* Palette overlay — when open */}
      {paletteOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-stone-900/30 backdrop-blur-[2px] flex items-start justify-center pt-[18vh]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closePalette()
            }}
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
          >
            <div
              className="w-[520px] max-w-[88vw] max-h-[60vh] flex flex-col rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-700">
                <Icon name="search" size={14} className="text-stone-500 dark:text-stone-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHighlightIdx(0)
                  }}
                  onKeyDown={paletteKeyDown}
                  placeholder="Search tasks, folders, actions…"
                  className="flex-1 bg-transparent text-[13px] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none"
                />
                <kbd className="text-[10px] font-mono text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
                  Esc
                </kbd>
              </div>
              <div className="flex-1 overflow-y-auto">
                {results.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[12px] text-stone-500 dark:text-stone-400">
                    Nothing matches "{query}". Try a folder name, task name, or "body double", "calendar", "vault".
                  </div>
                ) : (
                  <div role="listbox">
                    {results.map((r, i) => (
                      <button
                        key={r.id}
                        role="option"
                        aria-selected={i === highlightIdx}
                        onMouseEnter={() => setHighlightIdx(i)}
                        onClick={r.run}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                          i === highlightIdx
                            ? 'bg-accent/10'
                            : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                        }`}
                      >
                        <Icon
                          name={r.icon}
                          size={14}
                          className={
                            i === highlightIdx
                              ? 'text-accent shrink-0'
                              : 'text-stone-500 dark:text-stone-400 shrink-0'
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-[13px] truncate ${
                              i === highlightIdx
                                ? 'text-stone-900 dark:text-stone-100 font-medium'
                                : 'text-stone-800 dark:text-stone-200'
                            }`}
                          >
                            {r.label}
                          </div>
                          <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                            {r.hint}
                          </div>
                        </div>
                        {i === highlightIdx && (
                          <kbd className="text-[9px] font-mono text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded shrink-0">
                            ↵
                          </kbd>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 border-t border-stone-200 dark:border-stone-700 text-[10px] text-stone-500 dark:text-stone-400 flex items-center justify-between">
                <span>
                  <kbd className="font-mono">↑↓</kbd> navigate ·{' '}
                  <kbd className="font-mono">↵</kbd> run
                </span>
                <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

function PillButton({
  icon,
  label,
  onClick,
  disabled,
  title
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-7 px-2.5 inline-flex items-center gap-1 rounded-full text-[12px] ${
        disabled
          ? 'text-stone-400 dark:text-stone-600 cursor-not-allowed'
          : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100/80 dark:hover:bg-stone-800/60'
      }`}
    >
      <Icon name={icon} size={13} />
      <span>{label}</span>
    </button>
  )
}

// Simple substring + word-prefix score. Higher means better match.
// We don't need fuzzy; the palette is for instant recall, not exploration.
function matchScore(haystack: string, q: string): number {
  if (!q) return 0
  const h = haystack.toLowerCase()
  const needle = q.toLowerCase()
  if (h.startsWith(needle)) return 100
  if (h.includes(` ${needle}`)) return 80
  if (h.includes(needle)) return 50
  // Per-word prefix tolerance — let "tre" match "treatment plan".
  const words = h.split(/\s+/)
  const qWords = needle.split(/\s+/)
  let s = 0
  for (const qw of qWords) {
    if (words.some((w) => w.startsWith(qw))) s += 20
  }
  return s
}
