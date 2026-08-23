import { useCallback, useEffect, useRef, useState } from 'react'
import ChatPanel from '../ChatPanel'
import Icon from '../Icon'
import WebPanel from '../browser/WebPanel'
import { FLOATING_MENU_INSET_RIGHT, FLOATING_MENU_STYLE } from '../chrome/floatingMenu'
import { useAssistantChrome, type AssistantTab } from '../../stores/assistantChrome'
import StandupHome from '../views/StandupHome'
import AssistantTasksTab from './tabs/AssistantTasksTab'
import AssistantActivityTab from './tabs/AssistantActivityTab'
import AssistantWorkTab from './tabs/AssistantWorkTab'
import AssistantAgentTab from './tabs/AssistantAgentTab'
import { useChatStore } from '../../stores/chat'
import { useViewStore } from '../../stores/view'
import { useWidgetStore } from '../../stores/widgets'
import { useAssistantWidgetPin } from '../../lib/useAssistantWidgetPin'
import { useSidebarDockInset } from '../../lib/useSidebarDockInset'

// The assistant's global chrome, mirroring Notion's: a persistent pill at the
// bottom-right of EVERY screen, opening into Sidebar / Floating / Fullscreen —
// three containers over one conversation.
//
// Mounted at App level as a fixed overlay, so it survives the segment
// takeovers (office / plexidesk / plexipeople / plexibrain) that replace the
// whole <main> area — which is exactly why the old desk-PanelGroup assistant
// vanished on those screens.
//
// The invariant that matters: ONE ChatPanel instance at ONE stable tree
// position. Switching modes changes only the wrapper's classes, so nothing
// remounts — the conversation (store-held) AND the half-typed composer draft
// (component state) both survive. Closing to the pill is deliberate and does
// unmount; the conversation survives that too, the draft does not.
//
// Geometry facts this leans on: the app header is h-10 (40px), the footer is
// h-7 (28px). The pill and floating card sit above the footer; sidebar mode
// docks between header and footer while App pads <main> by the dock width so
// content is never covered (the meetPad precedent).

// Wrapper classes per mode. z-[120] keeps the assistant above the canvas
// chrome (FloatingToolbar z-45) and below the mic bar (z-150) and dialogs;
// fullscreen at z-[190] takes over everything below CommandCenter (220) and
// prompts (300).
//
// Fullscreen is Notion's AI page, not a modal takeover (3a.4, P6 + approved
// amendment): on normal screens it insets below the header (top-10) and to
// the right of the live-measured desk sidebar dock, so the app's nav stays
// visible AND clickable — navigating re-threads the conversation exactly as
// everywhere else. On segment takeovers there is no dock and the segment owns
// its own nav, so fullscreen stays full-bleed.
const WRAPPER_BY_MODE = {
  sidebar: 'fixed top-10 bottom-7 right-0 z-[120]',
  floating:
    'fixed right-[14px] bottom-[42px] z-[120] w-[min(420px,calc(100vw-28px))] h-[min(680px,calc(100vh-96px))]'
} as const
const FULLSCREEN_TAKEOVER = 'fixed inset-0 z-[190] bg-[var(--surface-base)]'
const FULLSCREEN_PAGE =
  'fixed top-10 bottom-0 right-0 z-[190] bg-[var(--surface-base)] border-l border-[var(--edge-soft)]'

// The persistent assistant's tabs (spec §5.3). Today is the daily standup, Chat is
// the conversation, the rest read real workspace state. Order matches the store's
// ASSISTANT_TABS.
const TAB_META: { id: AssistantTab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'wb_sunny' },
  { id: 'chat', label: 'Chat', icon: 'forum' },
  { id: 'agent', label: 'Agent', icon: 'rocket_launch' },
  { id: 'tasks', label: 'Tasks', icon: 'checklist' },
  { id: 'activity', label: 'Activity', icon: 'bolt' },
  { id: 'work', label: 'Work', icon: 'smart_toy' }
]

// The always-mounted web panel (A2, R4): it rides this component because it
// is the one assistant surface App.tsx always renders — the panel must
// exist on every view (the hub included, where the chrome below
// early-returns), so the default export mounts it unconditionally beside
// the chrome. The omnibar routes live in CommandCenter — one door.
export default function AssistantOverlay(): JSX.Element {
  return (
    <>
      <WebPanel />
      <AssistantOverlayChrome />
    </>
  )
}

function AssistantOverlayChrome(): JSX.Element {
  const open = useAssistantChrome((s) => s.open)
  const mode = useAssistantChrome((s) => s.mode)
  const width = useAssistantChrome((s) => s.width)
  const activeTab = useAssistantChrome((s) => s.activeTab)
  const setTab = useAssistantChrome((s) => s.setTab)
  const openPanel = useAssistantChrome((s) => s.openPanel)
  const close = useAssistantChrome((s) => s.close)
  const setWidth = useAssistantChrome((s) => s.setWidth)
  const persistWidth = useAssistantChrome((s) => s.persistWidth)
  // The pill pulses while a request is genuinely in flight — the one honest
  // "something is happening" signal we have. No invented unread badges.
  const sending = useChatStore((s) => s.sending)
  // Click-to-pin lifecycle (3a.1): watches the widget-activation signal and
  // the pin's clearing conditions. Lives here because this component never
  // unmounts, so the rules keep running even while the panel is closed.
  useAssistantWidgetPin()
  // Focus-mode suppression (3a.2, P4): while focus mode is genuinely showing,
  // its AI Chat tab IS the assistant — pill and panel both disappear. Keyed on
  // focus mode actually rendering (desk-type view + focusedWidgetId — the
  // predicate assistantContext uses), NOT on the raw store field: a stale
  // focusedWidgetId left behind by navigating away must not hide the pill on
  // other screens. Chrome state (open/mode/width) is deliberately untouched,
  // so exiting focus mode restores the assistant exactly as it was.
  const view = useViewStore((s) => s.view)
  const focusedWidgetId = useWidgetStore((s) => s.focusedWidgetId)
  const focusModeShowing =
    (view.kind === 'task' || view.kind === 'project-dashboard') && focusedWidgetId !== null
  // Plexii-hub suppression: while the hub page is showing, the page IS the
  // assistant (same rule as focus mode). Pill and panel both disappear so the
  // ONE-ChatPanel invariant holds; chrome state is untouched, so leaving the
  // hub restores the overlay exactly as it was.
  const hubShowing = view.kind === 'plexii'
  // Fullscreen-as-a-page geometry (3a.4): the same four takeover kinds App
  // uses. The dock inset is measured live so sidebar resizes and the minimised
  // 58px strip track truthfully.
  const segmentTakeover =
    view.kind === 'office' ||
    view.kind === 'plexidesk' ||
    view.kind === 'plexipeople' ||
    view.kind === 'plexibrain'
  const dockInset = useSidebarDockInset(open && mode === 'fullscreen' && !segmentTakeover)

  // Any surface can summon the assistant without prop-threading — the same
  // window event the empty-desk hint and the mindmap starting kit already
  // dispatch. It used to expand the desk panel; now it opens the overlay in
  // whichever mode was last used.
  useEffect(() => {
    function onOpen(): void {
      openPanel()
    }
    window.addEventListener('fb:open-assistant', onOpen)
    return () => window.removeEventListener('fb:open-assistant', onOpen)
  }, [openPanel])

  // Sidebar-mode resize — the same pointer-capture drag the desk sidebar uses
  // (chrome/floatingMenu useSidebarWidth), mirrored for a right-docked column:
  // dragging LEFT widens. Width persists when the drag settles.
  const [resizing, setResizing] = useState(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startX.current = e.clientX
      startW.current = width
      setResizing(true)
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* falls back to the window listeners below */
      }
    },
    [width]
  )
  useEffect(() => {
    if (!resizing) return
    function onMove(e: PointerEvent): void {
      setWidth(startW.current + (startX.current - e.clientX))
    }
    function onUp(): void {
      setResizing(false)
      persistWidth()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizing, setWidth, persistWidth])

  if (focusModeShowing || hubShowing) return <></>

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        title="Plexii — ask, plan, act (opens in your last view)"
        aria-label="Open Plexii"
        data-testid="assistant-pill"
        className="fb-floating-chrome fixed right-[14px] bottom-[42px] z-[120] h-10 w-10 rounded-full grid place-items-center border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-accent hover:border-[rgb(var(--accent)/0.5)] transition-colors"
        style={FLOATING_MENU_STYLE}
      >
        <Icon name="auto_awesome" size={18} filled />
        {sending && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-2 w-2" aria-label="working">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      className={
        mode === 'fullscreen'
          ? segmentTakeover
            ? FULLSCREEN_TAKEOVER
            : FULLSCREEN_PAGE
          : WRAPPER_BY_MODE[mode]
      }
      style={
        mode === 'sidebar'
          ? { width }
          : mode === 'fullscreen' && !segmentTakeover
            ? { left: dockInset }
            : undefined
      }
      data-testid="assistant-overlay"
      data-mode={mode}
    >
      {/* Sidebar-mode resize grip on the dock's left edge — the same
          affordance as the desk sidebar's, mirrored. */}
      {mode === 'sidebar' && (
        <div
          onPointerDown={onResizeStart}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              setWidth(width + 16)
              persistWidth()
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              setWidth(width - 16)
              persistWidth()
            }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Plexii"
          title="Drag to resize Plexii"
          tabIndex={0}
          data-testid="assistant-resize"
          className="group absolute top-0 left-0 h-full w-2.5 -translate-x-1 z-10 flex items-center justify-center cursor-col-resize outline-none touch-none"
        >
          <span
            className={`h-10 w-[3px] rounded-full transition-colors ${
              resizing
                ? 'bg-[rgb(var(--accent))]'
                : 'bg-transparent group-hover:bg-[rgb(var(--accent)/0.5)] group-focus-visible:bg-[rgb(var(--accent))]'
            }`}
          />
        </div>
      )}
      {/* One panel, three dressings — deliberately ONE element whose classes
          change, never a branch per mode: a per-mode branch would remount
          ChatPanel on every switch and eat the half-typed draft. In sidebar
          mode the inset column detaches the card from the window edge exactly
          as the old desk column did; in floating mode the wrapper IS the
          card's footprint; in fullscreen the panel IS the page — full-bleed,
          no inset box (ChatPanel drops its card chrome there and centers its
          own content columns). */}
      {/* Tabbed shell (spec §5): a tab strip over the content area. The Chat tab
          renders the EXISTING ChatPanel, which stays permanently mounted (hidden,
          never unmounted) so its half-typed draft + TipTap editor survive a tab
          switch — the same invariant the mode switch already relies on. The other
          tabs are cheap + stateless, so they mount/unmount freely. */}
      <div
        className={
          mode === 'sidebar'
            ? `h-full box-border ${FLOATING_MENU_INSET_RIGHT} flex flex-col`
            : 'h-full w-full flex flex-col'
        }
      >
        <div
          role="tablist"
          aria-label="Plexii sections"
          data-testid="assistant-tabs"
          className="shrink-0 flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--edge-soft)] bg-[var(--surface-raised)]"
        >
          {TAB_META.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                data-testid={`assistant-tab-${t.id}`}
                title={t.label}
                className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-[rgb(var(--accent))]'
                    : 'text-[var(--ink-60)] hover:bg-[var(--surface-sunken)]'
                }`}
              >
                <Icon name={t.icon} size={14} className="shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </div>
        {/* Opaque surface so the non-Chat tabs (Today/Agent/Tasks/Activity/Work)
            are never see-through — the Chat tab supplies its own card. Fullscreen
            uses the wrapper's own base surface. */}
        <div className={`flex-1 min-h-0 relative ${mode !== 'fullscreen' ? 'bg-[var(--surface-raised)]' : ''}`}>
          {/* Chat: always mounted, shown only on the Chat tab. */}
          <div className="h-full w-full" style={{ display: activeTab === 'chat' ? 'block' : 'none' }}>
            <ChatPanel onCollapse={close} />
          </div>
          {activeTab === 'today' && (
            <div className="h-full overflow-y-auto px-3 py-3" data-testid="assistant-tab-today-body">
              <StandupHome />
            </div>
          )}
          {activeTab === 'agent' && <AssistantAgentTab />}
          {activeTab === 'tasks' && <AssistantTasksTab />}
          {activeTab === 'activity' && <AssistantActivityTab />}
          {activeTab === 'work' && <AssistantWorkTab />}
        </div>
      </div>
    </div>
  )
}
