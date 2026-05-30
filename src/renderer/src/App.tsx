import { useEffect, useRef, useState } from 'react'
import {
  ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle
} from 'react-resizable-panels'
import Sidebar from './components/Sidebar'
import MainPane from './components/MainPane'
import ChatPanel from './components/ChatPanel'
import Icon from './components/Icon'
import SettingsPanel from './components/SettingsPanel'
import Footer from './components/Footer'
import FocusSessionOverlay from './components/FocusSessionOverlay'
import BringMeBack from './components/BringMeBack'
import HyperfocusGuardian from './components/HyperfocusGuardian'
import PreTaskBridge from './components/PreTaskBridge'
import SmartStackModal from './components/SmartStackModal'
import CursorSpotlight from './components/CursorSpotlight'
import PeerBodyDoubleDialog from './components/PeerBodyDoubleDialog'
import { usePeerBodyDoubleStore } from './stores/peerBodyDouble'
import { useNodeStore } from './stores/nodes'
import { useTemplateStore } from './stores/templates'
import { applyTheme, loadTheme, useTheme } from './lib/theme'
import { typingClick } from './lib/audioBeep'
import { setActiveWidgetForSound } from './lib/soundPrefs'
import { useWidgetStore } from './stores/widgets'
import { installLivingPageScheduler } from './lib/livingPageScheduler'
import { useViewStore } from './stores/view'
import './lib/timeOfDay' // side-effect: pushes --tod-* CSS vars to :root + ticks every 60s
import './lib/modelPrefs' // side-effect: pushes user's saved model mode to main process
import './lib/bodyDouble' // side-effect: auto-resumes Body Double mode if user had it enabled
import './lib/driftDetector' // side-effect: listens for window/document visibility + idle to detect drift
import './lib/hyperfocusGuardian' // side-effect: tracks continuous focus runs to offer breaks at 90 min

// Apply theme on script load — before React mounts — to avoid a light flash in dark mode
const _bootTheme = loadTheme()
applyTheme(_bootTheme.mode, _bootTheme.accent)

export default function App(): JSX.Element {
  const refresh = useNodeStore((s) => s.refresh)
  const setActive = useNodeStore((s) => s.setActive)
  const refreshTemplates = useTemplateStore((s) => s.refresh)
  const sidebarRef = useRef<ImperativePanelHandle>(null)
  const chatRef = useRef<ImperativePanelHandle>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState<{ x: number; y: number } | null>(null)
  const [smartStackOpen, setSmartStackOpen] = useState(false)
  // Peer body double — controlled HERE rather than inside its own
  // component so the dialog can be summoned from anywhere (button in
  // chrome, future keyboard shortcut, future "you've been stuck for 20
  // minutes — try a body double?" nudge) without losing state.
  const [bodyDoubleOpen, setBodyDoubleOpen] = useState(false)
  const peerStatus = usePeerBodyDoubleStore((s) => s.status)
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const unsectionedCount = useWidgetStore(
    (s) =>
      s.widgets.filter(
        (w) =>
          !w.archived &&
          !w.pinned &&
          w.kind !== 'section' &&
          w.parentSectionId === null
      ).length
  )
  const canSmartStack = !!activeTaskId && unsectionedCount >= 3
  const theme = useTheme()
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId)

  useEffect(() => {
    void refresh()
    void refreshTemplates()
    // Living-page auto-regen scheduler — subscribes to the widget store and
    // debounces regens whenever source widgets in a task change. Installs
    // once per app process; no teardown needed because it's a singleton.
    installLivingPageScheduler()
  }, [refresh, refreshTemplates])

  // On boot, if the persisted view is a task, hydrate the active task id so Canvas
  // (rendered by MainPane) loads the right widgets without requiring a sidebar click.
  useEffect(() => {
    const v = useViewStore.getState().view
    if (v.kind === 'task') setActive(v.taskId)
  }, [setActive])

  // Feed the active-widget id into the sound system so "Quiet while widget active" works
  useEffect(() => {
    setActiveWidgetForSound(activeWidgetId)
  }, [activeWidgetId])

  // Global keypress click (controlled by the user's sound prefs)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key.length !== 1) return // skip modifiers, arrows, function keys
      if (e.metaKey || e.ctrlKey || e.altKey) return
      typingClick()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function collapseSidebar(): void {
    sidebarRef.current?.collapse()
  }
  function expandSidebar(): void {
    sidebarRef.current?.expand()
  }
  function collapseChat(): void {
    chatRef.current?.collapse()
  }
  function expandChat(): void {
    chatRef.current?.expand()
  }

  function toggleSettings(): void {
    if (settingsOpen) {
      setSettingsOpen(null)
      return
    }
    const rect = settingsBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setSettingsOpen({ x: rect.right, y: rect.bottom + 6 })
  }

  return (
    <div className="fb-app-shell flex flex-col">
      <header className="titlebar-drag fb-glass-chrome h-10 flex items-center justify-between px-3 border-b border-[color:var(--glass-chrome-border)] transition-colors">
        <div className="titlebar-nodrag flex items-center gap-1">
          {sidebarCollapsed && (
            <button onClick={expandSidebar} className="icon-btn" title="Show workspace panel">
              <Icon name="keyboard_double_arrow_right" size={16} />
            </button>
          )}
        </div>
        <h1 className="text-[13px] font-semibold tracking-tight text-stone-900 dark:text-stone-100 select-none">
          FocusBuddy
        </h1>
        <div className="titlebar-nodrag flex items-center gap-1">
          <button
            onClick={() => canSmartStack && setSmartStackOpen(true)}
            disabled={!canSmartStack}
            className={`icon-btn ${canSmartStack ? '!text-accent' : ''}`}
            title={
              canSmartStack
                ? `Smart Stack — let AI group your ${unsectionedCount} unsectioned widgets into related sections`
                : activeTaskId
                  ? 'Need at least 3 unsectioned widgets on the canvas to find groups'
                  : 'Pick a task with widgets to Smart Stack'
            }
            aria-label="Smart Stack"
          >
            <Icon name="hub" size={16} filled={canSmartStack} />
          </button>
          <button
            onClick={() => setBodyDoubleOpen(true)}
            className="icon-btn relative"
            title={
              peerStatus === 'idle'
                ? 'Body double — pair with someone to feel less alone while you work'
                : peerStatus === 'looking'
                  ? 'Body double — searching for a partner…'
                  : peerStatus === 'matched'
                    ? 'Body double — partner found, click to greet'
                    : 'Body double — session active, click to open panel'
            }
            aria-label="Body double"
          >
            <Icon
              name="diversity_3"
              size={16}
              filled={peerStatus !== 'idle'}
              className={peerStatus !== 'idle' ? 'text-accent' : ''}
            />
            {/* Presence dot when a session is active */}
            {peerStatus === 'connected' && (
              <span className="absolute top-1 right-1 inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
            )}
            {peerStatus === 'matched' && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
          <button
            ref={settingsBtnRef}
            onClick={toggleSettings}
            className="icon-btn"
            title="Appearance settings"
            aria-label="Appearance settings"
          >
            <Icon name="settings" size={16} />
          </button>
          {chatCollapsed && (
            <button onClick={expandChat} className="icon-btn" title="Show assistant panel">
              <Icon name="keyboard_double_arrow_left" size={16} />
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="focusbuddy-main">
          <Panel
            ref={sidebarRef}
            defaultSize={20}
            minSize={14}
            maxSize={40}
            collapsible
            collapsedSize={0}
            onCollapse={() => setSidebarCollapsed(true)}
            onExpand={() => setSidebarCollapsed(false)}
          >
            <Sidebar onCollapse={collapseSidebar} />
          </Panel>
          <PanelResizeHandle className="w-px bg-stone-200 dark:bg-stone-700 hover:bg-stone-400 dark:hover:bg-stone-500 transition-colors" />
          <Panel defaultSize={56} minSize={30}>
            <MainPane />
          </Panel>
          <PanelResizeHandle className="w-px bg-stone-200 dark:bg-stone-700 hover:bg-stone-400 dark:hover:bg-stone-500 transition-colors" />
          <Panel
            ref={chatRef}
            defaultSize={24}
            minSize={16}
            maxSize={45}
            collapsible
            collapsedSize={0}
            onCollapse={() => setChatCollapsed(true)}
            onExpand={() => setChatCollapsed(false)}
          >
            <ChatPanel onCollapse={collapseChat} />
          </Panel>
        </PanelGroup>
      </main>
      <Footer />

      <FocusSessionOverlay />
      <BringMeBack />
      <HyperfocusGuardian />
      <PreTaskBridge />
      <CursorSpotlight />
      {smartStackOpen && <SmartStackModal onClose={() => setSmartStackOpen(false)} />}
      {bodyDoubleOpen && (
        <PeerBodyDoubleDialog onClose={() => setBodyDoubleOpen(false)} />
      )}

      {settingsOpen && (
        <SettingsPanel
          mode={theme.mode}
          accent={theme.accent}
          onModeChange={theme.setMode}
          onAccentChange={theme.setAccent}
          onClose={() => setSettingsOpen(null)}
          anchorX={settingsOpen.x}
          anchorY={settingsOpen.y}
        />
      )}
    </div>
  )
}
