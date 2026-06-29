import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import { useWidgetStore } from '../stores/widgets'
import type { WidgetKind, SearchHit } from '@shared/types'
import { WIDGET_CATALOG, WIDGET_SHORTCUTS } from '../lib/widgetCatalog'
import { getNavPrefs, setNavPrefs } from '../lib/navPrefs'
import Icon from './Icon'
import { useCapabilityEnabled, useCapabilityStore } from '../stores/capabilities'
import { canCreateWidget } from '../lib/gating'
import { promptUpgrade } from '../stores/upgradePrompt'
import { useEditorCommandStore } from '../stores/editorCommands'
import { useQuickCreate } from '../stores/quickCreate'
import { recencyRank } from '../lib/viewRecency'

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
  // Optional keyboard shortcut to surface in the row (e.g. a widget quick-add
  // key). Display only — the actual handler lives on the canvas.
  shortcut?: string
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
  // Deep content search results (notes, doc bodies, table cells, files) from the
  // main process, fetched async + debounced as the query changes.
  const [deepHits, setDeepHits] = useState<SearchHit[]>([])
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
  const goFiles = useViewStore((s) => s.goFiles)
  const goMail = useViewStore((s) => s.goMail)
  const goDocuments = useViewStore((s) => s.goDocuments)
  const goDesign = useViewStore((s) => s.goDesign)
  const goDocument = useViewStore((s) => s.goDocument)
  const goKnowledge = useViewStore((s) => s.goKnowledge)
  const goMessages = useViewStore((s) => s.goMessages)
  const goInbox = useViewStore((s) => s.goInbox)
  const goProjects = useViewStore((s) => s.goProjects)
  const goReports = useViewStore((s) => s.goReports)
  const goFlows = useViewStore((s) => s.goFlows)
  const goForms = useViewStore((s) => s.goForms)
  const goApps = useViewStore((s) => s.goApps)
  const goMeetings = useViewStore((s) => s.goMeetings)
  const requestCreate = useQuickCreate((s) => s.request)
  const view = useViewStore((s) => s.view)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const setZoom = useWidgetStore((s) => s.setZoom)
  const setPan = useWidgetStore((s) => s.setPan)
  const createWidget = useWidgetStore((s) => s.create)
  // Commands the active rich editor (Document, Slides) has published. Empty
  // unless the user is inside one. These drive the editor straight from Cmd+K.
  const editorCommands = useEditorCommandStore((s) => s.commands)
  const editorScope = useEditorCommandStore((s) => s.scope)

  // The pill's middle buttons swap based on what the user is doing.
  // - On the canvas (kind === 'task'): widget-creation shortcuts that
  //   mirror the most-used catalog kinds. Closest match to the 2.0 mockup's
  //   "Note · Browser · Table · Board · Timer · Whiteboard · Calculator".
  // - Elsewhere (home, project dashboard, etc.): action-shortcuts that
  //   make sense without a canvas — New, Body double, Smart Stack.
  // All actions are also reachable from the palette and chrome, so the
  // pill is a convenience, never the only path.
  // Spawn a widget on the active task at a sensible position, gated by the
  // capability matrix. Shared by the pill, the palette's "Add" commands, and
  // (via the same catalog) the canvas quick-add shortcuts.
  const spawnWidget = useCallback(
    (kind: WidgetKind): void => {
      if (!activeTaskId) return
      if (!canCreateWidget(caps, kind)) {
        promptUpgrade(`The ${kind} widget is a Pro feature.`)
        return
      }
      const entry = WIDGET_CATALOG.find((e) => e.kind === kind)
      void createWidget({
        taskId: activeTaskId,
        kind,
        title: '',
        content: entry?.defaultContent || '',
        x: 80 + Math.round(Math.random() * 120),
        y: 80 + Math.round(Math.random() * 80),
        width: entry?.defaultWidth ?? 320,
        height: entry?.defaultHeight ?? 240,
        color: kind === 'sticky' ? '#fef08a' : null
      })
    },
    [activeTaskId, caps, createWidget]
  )

  const contextActions = useMemo<PillAction[]>(() => {
    if (view.kind === 'task' && activeTaskId) {
      const spawn = (kind: WidgetKind): (() => void) => () => spawnWidget(kind)
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
  }, [view, activeTaskId, spawnWidget, canSmartStack, onOpenBodyDouble, onOpenSmartStack, bodyDoubleEnabled])

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

  // Deep content search across the whole workspace — debounced, only while the
  // palette is open and the query is meaningful. Results merge into the list
  // below the instant name matches.
  useEffect(() => {
    const q = query.trim()
    if (!paletteOpen || q.length < 2) {
      setDeepHits([])
      return undefined
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void window.api.search.query(q).then((hits) => {
        if (!cancelled) setDeepHits(hits)
      })
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, paletteOpen])

  const results = useMemo<CommandResult[]>(() => {
    const q = query.trim().toLowerCase()
    const items: CommandResult[] = []

    // Active-editor commands first. When the user is inside a document or slide
    // deck and opens the palette, formatting / view / insert actions are almost
    // always what they want, so these outrank navigation. On an empty query they
    // lead the list in their declared order; on a real query they only appear
    // when they actually match, but then they rank above general results.
    for (let idx = 0; idx < editorCommands.length; idx++) {
      const c = editorCommands[idx]
      const hay = `${c.label} ${c.keywords ?? ''} ${c.group ?? ''}`
      const m = matchScore(hay, q)
      const score = q === '' ? 300 - idx : m > 0 ? m + 150 : 0
      items.push({
        id: `ec-${c.id}`,
        label: c.label,
        hint: c.group ? `${editorScope ?? 'Editor'} · ${c.group}` : editorScope ?? 'Editor',
        icon: c.icon ?? 'bolt',
        kind: 'action',
        score,
        shortcut: c.shortcut,
        run: () => {
          c.run()
          if (!c.keepOpen) closePalette()
        }
      })
    }

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
    // Navigation to the other top-level surfaces.
    // On an empty query, float the modules the person actually uses to the top.
    // recencyRank is -1 when a module hasn't been visited, 0 for the most recent.
    const recBonus = (kind: string): number => {
      if (q !== '') return 0
      const r = recencyRank(kind)
      return r >= 0 ? (8 - r) * 2 : 0
    }
    const navTargets: Array<{ id: string; label: string; hint: string; icon: string; words: string; viewKind: string; go: () => void }> = [
      { id: 'go-documents', label: 'Documents', hint: 'Docs, sheets, slides', icon: 'article', words: 'documents docs sheets slides', viewKind: 'documents', go: goDocuments },
      { id: 'go-design', label: 'PlexiDesign', hint: 'Designs — social, posters, logos', icon: 'palette', words: 'design plexidesign canva graphic poster social logo flyer banner', viewKind: 'design', go: goDesign },
      { id: 'go-files', label: 'Files', hint: 'File manager', icon: 'folder', words: 'files folders manager', viewKind: 'files', go: goFiles },
      { id: 'go-mail', label: 'Mail', hint: 'Email inbox', icon: 'mail', words: 'mail email inbox', viewKind: 'mail', go: () => goMail() },
      { id: 'go-inbox', label: 'PlexiInbox', hint: 'Notifications, share invites', icon: 'inbox', words: 'inbox notifications invites plexi', viewKind: 'inbox', go: goInbox },
      { id: 'go-messages', label: 'Messages', hint: 'Chats', icon: 'forum', words: 'messages chat dm', viewKind: 'messages', go: goMessages }
    ]
    for (const t of navTargets) {
      items.push({
        id: t.id,
        label: t.label,
        hint: t.hint,
        icon: t.icon,
        kind: 'action',
        score: (q === '' ? 55 : matchScore(t.words, q)) + recBonus(t.viewKind),
        run: () => {
          setActive(null)
          t.go()
          closePalette()
        }
      })
    }
    items.push({
      id: 'new-task',
      label: 'New folder or task',
      hint: 'Create a desk or task',
      icon: 'add',
      kind: 'action',
      score: q === '' ? 58 : matchScore('new folder task desk create', q),
      run: () => {
        window.dispatchEvent(new CustomEvent('fb:command-new-task'))
        closePalette()
      }
    })
    // New design: open the PlexiDesign hub to pick a size or template.
    items.push({
      id: 'new-design',
      label: 'New design',
      hint: 'PlexiDesign — social, poster, logo, any size',
      icon: 'palette',
      kind: 'action',
      score: q === '' ? 56 : matchScore('new design plexidesign canva poster social logo flyer graphic create', q),
      run: () => {
        setActive(null)
        goDesign()
        closePalette()
      }
    })
    // Global quick-create: "New <module item>" from anywhere. Each sets a pending
    // request and navigates; the module creates the item as it opens, so there is
    // no separate "start new" screen to click through.
    const createTargets: Array<{ id: string; label: string; words: string; icon: string; key: string; viewKind: string; go: () => void }> = [
      { id: 'new-project', label: 'New project', words: 'new project plan gantt create', icon: 'account_tree', key: 'projects', viewKind: 'projects', go: goProjects },
      { id: 'new-report', label: 'New report', words: 'new report summary create', icon: 'summarize', key: 'reports', viewKind: 'reports', go: goReports },
      { id: 'new-flow', label: 'New flow', words: 'new flow automation create', icon: 'bolt', key: 'flows', viewKind: 'flows', go: goFlows },
      { id: 'new-form', label: 'New form', words: 'new form survey create', icon: 'dynamic_form', key: 'forms', viewKind: 'forms', go: goForms },
      { id: 'new-app', label: 'New app', words: 'new app build tool create', icon: 'construction', key: 'build', viewKind: 'apps', go: goApps },
      { id: 'new-meeting', label: 'Start a meeting', words: 'new meeting meet call video start', icon: 'video_call', key: 'meet', viewKind: 'meetings', go: goMeetings }
    ]
    for (const t of createTargets) {
      items.push({
        id: t.id,
        label: t.label,
        hint: 'Create and open it',
        icon: t.icon,
        kind: 'action',
        score: (q === '' ? 57 : matchScore(t.words, q)) + recBonus(t.viewKind),
        run: () => {
          requestCreate(t.key)
          setActive(null)
          t.go()
          closePalette()
        }
      })
    }
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
      items.push({
        id: 'toggle-snap',
        label: getNavPrefs().snapToGridEnabled ? 'Snap to grid: on (turn off)' : 'Snap to grid: off (turn on)',
        hint: 'Round dragged widgets to an 8px grid',
        icon: 'grid_4x4',
        kind: 'action',
        score: q === '' ? 48 : matchScore('snap grid align canvas', q),
        run: () => {
          setNavPrefs({ snapToGridEnabled: !getNavPrefs().snapToGridEnabled })
          closePalette()
        }
      })
      // "Add <widget>" for every picker-visible kind, driven by the catalog so
      // the palette always matches the picker. The quick-add shortcut (if any)
      // is shown in the row and works directly on the canvas.
      for (const entry of WIDGET_CATALOG) {
        if (entry.hideFromPicker) continue
        const sc = WIDGET_SHORTCUTS[entry.kind]
        items.push({
          id: `add-${entry.kind}`,
          label: `Add ${entry.label}`,
          hint: entry.hint,
          icon: entry.icon,
          kind: 'action',
          score: q === '' ? 40 : matchScore(`add ${entry.label} ${entry.kind} widget ${entry.category}`, q),
          shortcut: sc,
          run: () => {
            spawnWidget(entry.kind)
            closePalette()
          }
        })
      }
    }

    // Empty query → list every folder + task for browsing (capped). For a real
    // query, deep search (below) owns node results too, so they rank correctly
    // by title/description match rather than appearing twice.
    if (q === '') {
      let added = 0
      for (const n of nodes) {
        if (n.archived) continue
        if (added >= 60) break
        const isFolder = n.kind === 'folder'
        items.push({
          id: `node-${n.id}`,
          label: n.title || (isFolder ? '(untitled folder)' : '(untitled task)'),
          hint: isFolder ? 'Open folder' : 'Open task',
          icon: isFolder ? 'folder' : 'task_alt',
          kind: 'jump',
          score: 30 + (n.kind === 'task' && n.status !== 'done' ? 5 : 0),
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
    }

    // Deep content search — anything the main process found in note/page/doc
    // bodies, table cells, file names, and node descriptions. Ranked above the
    // static commands when there's a real query, since this is what the user is
    // usually after. Each routes to where the match lives.
    for (const h of deepHits) {
      items.push({
        id: `hit-${h.type}-${h.id}`,
        label: h.title,
        hint: h.snippet ? `${hitKindLabel(h)} · ${h.snippet}` : hitKindLabel(h),
        icon: hitIcon(h),
        kind: 'action',
        // h.score (0..1000+) scaled so a strong content/title match sits at the
        // top, a weak body match still above the static nav items.
        score: 140 + h.score / 8,
        run: () => {
          runHit(h, { goProject, goTask, goDocument, goFiles, goKnowledge, setActive })
          closePalette()
        }
      })
    }

    const ranked = items
      .filter((i) => (q === '' ? true : i.score > 0))
      .sort((a, b) => b.score - a.score)
    // Empty query shows the FULL list so every command — each Add-widget entry,
    // all navigation, every desk/task — is scrollable and findable by eye, not
    // just a top slice. A search query is self-limiting, but cap it generously
    // so a single common letter can't render hundreds of rows at once.
    return q === '' ? ranked : ranked.slice(0, 50)
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
    goFiles,
    goMail,
    goDocuments,
    goDesign,
    goDocument,
    goKnowledge,
    goMessages,
    goInbox,
    goProjects,
    goReports,
    goFlows,
    goForms,
    goApps,
    goMeetings,
    requestCreate,
    spawnWidget,
    deepHits,
    setZoom,
    setPan,
    editorCommands,
    editorScope
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
                {editorScope && editorCommands.length > 0 && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-accent bg-accent/10 border border-accent/20 rounded-md px-1.5 py-0.5"
                    title={`Commands here drive the active ${editorScope.toLowerCase()}`}
                  >
                    <Icon name="bolt" size={11} />
                    {editorScope}
                  </span>
                )}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHighlightIdx(0)
                  }}
                  onKeyDown={paletteKeyDown}
                  placeholder={
                    editorScope && editorCommands.length > 0
                      ? `Command the ${editorScope.toLowerCase()}, or search everything…`
                      : 'Search everything — tasks, notes, docs, files, actions…'
                  }
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
                        {r.shortcut && (
                          <kbd className="text-[9px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded shrink-0">
                            {r.shortcut}
                          </kbd>
                        )}
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

// ── Deep-search hit helpers ─────────────────────────────────────────────────

function hitIcon(h: SearchHit): string {
  switch (h.type) {
    case 'folder':
      return 'folder'
    case 'task':
      return 'task_alt'
    case 'document':
      return h.docType === 'sheet' ? 'table_chart' : h.docType === 'slides' ? 'slideshow' : 'description'
    case 'file':
      return 'draft'
    case 'table-row':
      return 'table_chart'
    case 'knowledge':
      return 'neurology'
    default:
      return 'widgets' // widget
  }
}

function hitKindLabel(h: SearchHit): string {
  switch (h.type) {
    case 'folder':
      return 'Folder'
    case 'task':
      return 'Task'
    case 'document':
      return h.docType === 'sheet' ? 'Spreadsheet' : h.docType === 'slides' ? 'Slides' : 'Document'
    case 'file':
      return 'File'
    case 'table-row':
      return 'Table'
    case 'knowledge':
      return 'PlexiBrain'
    default:
      return 'On a desk'
  }
}

interface HitNav {
  goProject: (id: string) => void
  goTask: (id: string) => void
  goDocument: (id: string) => void
  goFiles: () => void
  goKnowledge: (entryId?: string) => void
  setActive: (id: string | null) => void
}

function runHit(h: SearchHit, nav: HitNav): void {
  switch (h.type) {
    case 'folder':
      nav.goProject(h.id)
      break
    case 'task':
      nav.setActive(h.id)
      nav.goTask(h.id)
      break
    case 'widget':
    case 'table-row':
      // Open the canvas the widget / table lives on.
      if (h.taskId) {
        nav.setActive(h.taskId)
        nav.goTask(h.taskId)
      }
      break
    case 'document':
      nav.goDocument(h.id)
      break
    case 'file':
      nav.goFiles()
      break
    case 'knowledge':
      nav.goKnowledge(h.id)
      break
  }
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
