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
import CommandCenter from './components/CommandCenter'
import AICommandBar from './components/AICommandBar'
import VoiceCommandFAB from './components/VoiceCommandFAB'
import LaunchSignInModal from './components/LaunchSignInModal'
import UpgradePromptModal from './components/UpgradePromptModal'
import { usePeerBodyDoubleStore } from './stores/peerBodyDouble'
import { useNodeStore } from './stores/nodes'
import { useTemplateStore } from './stores/templates'
import { useVaultStore } from './stores/vault'
import { useAccountStore } from './stores/account'
import { installInboxPoller } from './lib/inboxPoller'
import { applyFont, applyTheme, loadTheme, useTheme } from './lib/theme'
import { typingClick } from './lib/audioBeep'
import { setActiveWidgetForSound } from './lib/soundPrefs'
import { useWidgetStore } from './stores/widgets'
import { installLivingPageScheduler } from './lib/livingPageScheduler'
import { installCapabilityWatcher } from './stores/capabilities'
import { useViewStore } from './stores/view'
import './lib/timeOfDay' // side-effect: pushes --tod-* CSS vars to :root + ticks every 60s
import './lib/modelPrefs' // side-effect: pushes user's saved model mode to main process
import './lib/bodyDouble' // side-effect: auto-resumes Body Double mode if user had it enabled
import './lib/driftDetector' // side-effect: listens for window/document visibility + idle to detect drift
import './lib/hyperfocusGuardian' // side-effect: tracks continuous focus runs to offer breaks at 90 min

// Apply theme on script load — before React mounts — to avoid a light flash in dark mode
const _bootTheme = loadTheme()
applyTheme(_bootTheme.mode, _bootTheme.accent, _bootTheme.customAccentHex)
applyFont(_bootTheme.font)

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
  // AI Command Bar — the "AI is the OS" entry point. Opened from the
  // header button or Cmd+Shift+K. Owned at App level so any future hook
  // can summon it (a stuck-detector nudge, a contextual "did you mean…"
  // suggestion, etc.) without prop-drilling.
  const [aiBarOpen, setAiBarOpen] = useState(false)
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
  // Vault state powers the "Local · encrypted" chip in the header. We
  // refresh meta on mount so the chip can reflect whether the vault has
  // been initialised at all (no chip = surprising; chip with a "set up
  // vault" hint = informative).
  const vaultMeta = useVaultStore((s) => s.meta)
  const vaultUnlocked = useVaultStore((s) => s.unlocked)
  const refreshVaultMeta = useVaultStore((s) => s.refreshMeta)
  // Account boot — kicked off once on mount. The LaunchSignInModal reads
  // bootStatus to know when it's safe to render.
  const accountInit = useAccountStore((s) => s.init)
  const account = useAccountStore((s) => s.account)
  const signOut = useAccountStore((s) => s.signOut)
  const adoptHandoff = useAccountStore((s) => s.adoptHandoff)

  // Web→desktop auth handoff. The brochure sign-in flow at haptyx.app/account/*
  // produces a session token, then deep-links to haptyx://auth?token=...
  // which main forwards over IPC. We adopt the token here.
  useEffect(() => {
    let detach: (() => void) | null = null
    async function consumeAndSubscribe(): Promise<void> {
      const pending = await window.api.auth.getPending()
      if (pending) await adoptHandoff({ sessionToken: pending.sessionToken, email: pending.email })
      detach = window.api.auth.onIncomingToken((handoff) => {
        void adoptHandoff({ sessionToken: handoff.sessionToken, email: handoff.email })
      })
    }
    void consumeAndSubscribe()
    return () => { detach?.() }
  }, [adoptHandoff])

  useEffect(() => {
    void refresh()
    void refreshTemplates()
    void refreshVaultMeta()
    void accountInit()
    // Living-page auto-regen scheduler — subscribes to the widget store and
    // debounces regens whenever source widgets in a task change. Installs
    // once per app process; no teardown needed because it's a singleton.
    installLivingPageScheduler()
    // Inbox poller — subscribes to the account store and polls the server
    // for new inbox items when the user is signed in. No-op when signed
    // out. Tears down automatically on sign-out.
    installInboxPoller()
    // Capability watcher — fetches /account/capabilities on auth change
    // and on window focus. Drives the useCapability hook + the in-app
    // gates (body double, marketplace credits, AI features per tier).
    installCapabilityWatcher()
  }, [refresh, refreshTemplates, refreshVaultMeta, accountInit])

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

  // Cmd+Shift+K toggles the AI command bar — distinct from Cmd+K (the
  // search palette). Two shortcuts for two purposes: search what exists,
  // vs. ask AI to make something new.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAiBarOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
        <div className="titlebar-nodrag flex items-center gap-2">
          {sidebarCollapsed && (
            <button onClick={expandSidebar} className="icon-btn" title="Show workspace panel">
              <Icon name="keyboard_double_arrow_right" size={16} />
            </button>
          )}
          {/* "Local · encrypted" — the trust chip. Reflects whether the
              user has set up the vault (and unlocked it). Reinforces the
              BYO-key promise without nagging. Hidden on a fresh install
              with no vault yet to avoid noise. */}
          {vaultMeta?.exists && (
            <div
              className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                vaultUnlocked
                  ? 'bg-emerald-100/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50 dark:border-emerald-800/50'
                  : 'bg-stone-100/70 dark:bg-stone-800/70 text-stone-600 dark:text-stone-300 border border-stone-300/50 dark:border-stone-700/50'
              }`}
              title={
                vaultUnlocked
                  ? 'Vault unlocked. Your secrets stay on this device — FocusBuddy never sees them.'
                  : 'Vault is locked. Unlock from the Vault view to use saved credentials.'
              }
            >
              <Icon name={vaultUnlocked ? 'lock_open' : 'lock'} size={10} />
              <span>Local · encrypted</span>
            </div>
          )}
          {/* Account chip — visible when signed in. Click to sign out
              (with confirm). Server-validated session means this chip
              only renders for users with a verified live token. */}
          {account && (
            <button
              onClick={() => {
                const ok = window.confirm(
                  `Sign out of ${account.email}? Your local data stays on this device. Shared items in your inbox will stay until you remove them.`
                )
                if (ok) void signOut()
              }}
              className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 dark:bg-accent/15 text-accent border border-accent/30 hover:brightness-110 transition-colors"
              title={`Signed in as ${account.email}. Click to sign out.`}
            >
              <span className="h-3.5 w-3.5 rounded-full bg-accent/30 inline-flex items-center justify-center text-[8px] font-mono text-accent uppercase">
                {(account.handle || account.email).slice(0, 1)}
              </span>
              <span className="max-w-[120px] truncate">
                {account.handle || account.email.split('@')[0]}
              </span>
            </button>
          )}
        </div>
        <h1 className="text-[12px] font-semibold tracking-[0.18em] text-stone-900 dark:text-stone-100 select-none flex items-center gap-1.5">
          <span>FOCUSBUDDY</span>
          <span className="text-[9px] font-mono text-accent px-1 py-px rounded bg-accent/10 border border-accent/20">
            2.0
          </span>
        </h1>
        <div className="titlebar-nodrag flex items-center gap-1">
          {/* AI command bar trigger — the "AI as the operating system"
              entry point. Sits prominently in the header so it's the
              first affordance the eye lands on. Cmd+Shift+K opens it
              from anywhere. */}
          <button
            onClick={() => setAiBarOpen(true)}
            className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-white/[0.06] border border-transparent hover:border-stone-200 dark:hover:border-white/[0.06] transition-colors"
            title="AI command bar — describe what you want and AI builds it (⌘⇧K)"
            aria-label="AI command bar"
          >
            <Icon name="auto_awesome" size={12} className="text-accent" />
            <span>Ask AI</span>
            <kbd className="text-[9px] font-mono opacity-60 ml-0.5">⌘⇧K</kbd>
          </button>
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
      <CommandCenter
        onOpenBodyDouble={() => setBodyDoubleOpen(true)}
        onOpenSmartStack={() => canSmartStack && setSmartStackOpen(true)}
        canSmartStack={canSmartStack}
      />
      <LaunchSignInModal />
      <UpgradePromptModal />
      <AICommandBar open={aiBarOpen} onClose={() => setAiBarOpen(false)} />
      <VoiceCommandFAB />
      {smartStackOpen && <SmartStackModal onClose={() => setSmartStackOpen(false)} />}
      {bodyDoubleOpen && (
        <PeerBodyDoubleDialog onClose={() => setBodyDoubleOpen(false)} />
      )}

      {settingsOpen && (
        <SettingsPanel
          mode={theme.mode}
          accent={theme.accent}
          font={theme.font}
          customAccentHex={theme.customAccentHex}
          onModeChange={theme.setMode}
          onAccentChange={theme.setAccent}
          onFontChange={theme.setFont}
          onCustomAccentChange={theme.setCustomAccent}
          onClose={() => setSettingsOpen(null)}
          anchorX={settingsOpen.x}
          anchorY={settingsOpen.y}
        />
      )}
    </div>
  )
}
