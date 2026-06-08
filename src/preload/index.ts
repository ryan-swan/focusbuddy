import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActionProposal,
  ActivityEvent,
  ActivityRecordDraft,
  AiBuildResponse,
  BodyDoubleResponse,
  BrowsingHistoryEntry,
  ChatRequest,
  ChatResponse,
  ConnectedApp,
  ConnectedAppDraft,
  ConnectedAppPatch,
  ContextMenuPayload,
  DashboardCardKind,
  DashboardLayout,
  EnergyLevel,
  EnergyLogEntry,
  FbNode,
  HapticFeel,
  FocusSession,
  FocusSessionCompletePatch,
  FocusSessionStartDraft,
  LivingPageRegenerateResponse,
  ModelMode,
  NodeDraft,
  NodePatch,
  SetupSuggestResponse,
  SmartStackResponse,
  SnapshotMeta,
  Template,
  TrailSummaryResponse,
  VaultEntryDraft,
  VaultEntryPatch,
  VaultEntryStored,
  VaultMeta,
  Widget,
  WidgetDraft,
  ShareableKind,
  ShareLink,
  SharedItem,
  ShareScope,
  WidgetLink,
  WidgetPatch,
  WireType
} from '@shared/types'
import type {
  FbFile,
  FbRow,
  FbRowDraft,
  FbRowPatch,
  FbTable,
  FbTableDraft,
  FbTablePatch
} from '@shared/fields'

type VaultResult = { ok: true } | { ok: false; error: string }

const api = {
  nodes: {
    list: (): Promise<FbNode[]> => ipcRenderer.invoke('nodes:list'),
    get: (id: string): Promise<FbNode | null> => ipcRenderer.invoke('nodes:get', id),
    create: (draft: NodeDraft): Promise<FbNode> => ipcRenderer.invoke('nodes:create', draft),
    update: (id: string, patch: NodePatch): Promise<FbNode | null> =>
      ipcRenderer.invoke('nodes:update', id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('nodes:delete', id),
    move: (
      id: string,
      newParentId: string | null,
      beforeId: string | null
    ): Promise<FbNode | null> =>
      ipcRenderer.invoke('nodes:move', id, newParentId, beforeId)
  },
  widgets: {
    listByTask: (taskId: string): Promise<Widget[]> =>
      ipcRenderer.invoke('widgets:listByTask', taskId),
    create: (draft: WidgetDraft): Promise<Widget> => ipcRenderer.invoke('widgets:create', draft),
    update: (id: string, patch: WidgetPatch): Promise<Widget | null> =>
      ipcRenderer.invoke('widgets:update', id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('widgets:delete', id),
    bringToFront: (id: string): Promise<Widget | null> =>
      ipcRenderer.invoke('widgets:bringToFront', id)
  },
  widgetLinks: {
    listByTask: (taskId: string): Promise<WidgetLink[]> =>
      ipcRenderer.invoke('widgetLinks:listByTask', taskId),
    create: (
      sourceWidgetId: string,
      targetWidgetId: string,
      taskId: string,
      type?: WireType
    ): Promise<WidgetLink | null> =>
      ipcRenderer.invoke('widgetLinks:create', sourceWidgetId, targetWidgetId, taskId, type),
    update: (
      id: string,
      patch: { type?: WireType; verb?: string; enabled?: boolean }
    ): Promise<WidgetLink | null> => ipcRenderer.invoke('widgetLinks:update', id, patch),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('widgetLinks:delete', id)
  },
  snapshots: {
    create: (taskId: string, label?: string): Promise<SnapshotMeta> =>
      ipcRenderer.invoke('snapshots:create', taskId, label),
    list: (taskId: string): Promise<SnapshotMeta[]> =>
      ipcRenderer.invoke('snapshots:list', taskId),
    get: (id: string): Promise<{ meta: SnapshotMeta; widgets: Widget[] } | null> =>
      ipcRenderer.invoke('snapshots:get', id),
    restore: (id: string): Promise<{ taskId: string; widgets: Widget[] } | null> =>
      ipcRenderer.invoke('snapshots:restore', id),
    branch: (id: string, title: string): Promise<{ taskId: string } | null> =>
      ipcRenderer.invoke('snapshots:branch', id, title)
  },
  wires: {
    runTransform: (
      sourceId: string,
      targetId: string,
      verb: string,
      liveText?: string
    ): Promise<{
      ok: boolean
      result?: string
      skipped?: boolean
      needsApiKey?: boolean
      error?: string
    }> => ipcRenderer.invoke('wires:runTransform', sourceId, targetId, verb, liveText)
  },
  shares: {
    listAll: (): Promise<ShareLink[]> => ipcRenderer.invoke('shares:listAll'),
    listForEntity: (
      kind: ShareableKind,
      entityId: string
    ): Promise<ShareLink[]> =>
      ipcRenderer.invoke('shares:listForEntity', kind, entityId),
    create: (input: {
      token: string
      kind: ShareableKind
      entityId: string
      label: string
      scope: ShareScope
      expiresAt: number | null
    }): Promise<ShareLink> => ipcRenderer.invoke('shares:create', input),
    revoke: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('shares:revoke', id),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('shares:delete', id),
    inbox: (): Promise<SharedItem[]> => ipcRenderer.invoke('shares:inbox'),
    accept: (input: {
      token: string
      kind: ShareableKind
      snapshot: unknown
      fromHandle: string
      scope: ShareScope
    }): Promise<SharedItem> => ipcRenderer.invoke('shares:accept', input),
    removeInbox: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('shares:removeInbox', id)
  },
  // Account session — load/save/clear lives in main so the session token
  // is encrypted at rest via Electron safeStorage. The renderer treats
  // the token as opaque and never persists it directly.
  streamdeck: {
    execute: (
      action: unknown
    ): Promise<{ ok: boolean; error?: string; needsAccessibility?: boolean }> =>
      ipcRenderer.invoke('streamdeck:execute', action),
    openAccessibilitySettings: (): Promise<{
      ok: boolean
      strategy: string
    }> => ipcRenderer.invoke('streamdeck:openAccessibilitySettings'),
    checkAccessibility: (): Promise<boolean> =>
      ipcRenderer.invoke('streamdeck:checkAccessibility'),
    // Triggers the macOS native accessibility prompt with a working
    // "Open System Settings" button. Returns the current trust state.
    promptAccessibility: (): Promise<boolean> =>
      ipcRenderer.invoke('streamdeck:promptAccessibility'),
    // Just opens System Settings (or System Preferences) by app name —
    // bulletproof, no URL processing involved. User navigates manually.
    openSettingsApp: (): Promise<boolean> =>
      ipcRenderer.invoke('streamdeck:openSettingsApp'),
    // Reveals the running app's bundle in Finder. In dev = Electron.app,
    // in prod = FocusBuddy.app. The user drags this into Accessibility.
    revealAppInFinder: (): Promise<{
      ok: boolean
      bundleName: string | null
    }> => ipcRenderer.invoke('streamdeck:revealAppInFinder')
  },
  // Universal SpeedDeck config — shared across every SpeedDeck widget
  // in "Universal" scope so the same buttons follow the user from task
  // to task. Stored as opaque JSON in userData; the renderer
  // parses/serialises via parseDeckConfig.
  speeddeck: {
    loadUniversal: (): Promise<string | null> =>
      ipcRenderer.invoke('speeddeck:loadUniversal'),
    saveUniversal: (json: string): Promise<void> =>
      ipcRenderer.invoke('speeddeck:saveUniversal', json)
  },
  activity: {
    getState: (): Promise<{
      enabled: boolean
      switchCount: number
      pressCount: number
    }> => ipcRenderer.invoke('activity:getState'),
    setEnabled: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('activity:setEnabled', enabled),
    read: (): Promise<{
      enabled: boolean
      switches: Array<{ app: string; ts: number }>
      presses: Array<{ label: string; kind: string; ts: number }>
    }> => ipcRenderer.invoke('activity:read'),
    logPress: (input: { label: string; kind: string }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('activity:logPress', input),
    wipe: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('activity:wipe')
  },
  account: {
    load: (): Promise<{
      sessionToken: string | null
      skippedAt: number | null
      cachedEmail: string | null
    }> => ipcRenderer.invoke('account:load'),
    saveSession: (input: { token: string; email: string | null }): Promise<void> =>
      ipcRenderer.invoke('account:saveSession', input),
    clearSession: (): Promise<void> => ipcRenderer.invoke('account:clearSession'),
    setSkipped: (skipped: boolean): Promise<void> =>
      ipcRenderer.invoke('account:setSkipped', skipped),
    setCachedEmail: (email: string | null): Promise<void> =>
      ipcRenderer.invoke('account:setCachedEmail', email)
  },
  chat: {
    send: (req: ChatRequest): Promise<ChatResponse> => ipcRenderer.invoke('chat:send', req),
    hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('chat:hasApiKey'),
    proactiveWelcome: (taskId: string): Promise<ChatResponse> =>
      ipcRenderer.invoke('chat:proactiveWelcome', taskId)
  },
  resume: {
    generate: (
      taskId: string
    ): Promise<{ ok: boolean; markdown?: string; error?: string; needsApiKey?: boolean }> =>
      ipcRenderer.invoke('resume:generate', taskId)
  },
  setup: {
    suggest: (taskId: string): Promise<SetupSuggestResponse> =>
      ipcRenderer.invoke('setup:suggest', taskId),
    buildFromPrompt: (input: {
      prompt: string
      taskId: string | null
    }): Promise<AiBuildResponse> =>
      ipcRenderer.invoke('setup:buildFromPrompt', input)
  },
  livingPage: {
    regenerate: (widgetId: string): Promise<LivingPageRegenerateResponse> =>
      ipcRenderer.invoke('livingPage:regenerate', widgetId)
  },
  ai: {
    suggestPageContent: (
      prompt: string
    ): Promise<{
      ok: boolean
      tiptapJson?: string
      markdown?: string
      error?: string
      needsApiKey?: boolean
    }> => ipcRenderer.invoke('ai:suggestPageContent', prompt),
    suggestTableRows: (
      tableId: string,
      prompt: string,
      count: number
    ): Promise<{
      ok: boolean
      rows?: Array<Record<string, unknown>>
      columnsToAdd?: Array<{
        label: string
        type: string
        options?: string[]
      }>
      error?: string
      needsApiKey?: boolean
    }> => ipcRenderer.invoke('ai:suggestTableRows', tableId, prompt, count)
  },
  history: {
    record: (url: string, title: string, taskId: string | null): Promise<void> =>
      ipcRenderer.invoke('history:record', url, title, taskId),
    recent: (limit: number, taskId?: string | null): Promise<BrowsingHistoryEntry[]> =>
      ipcRenderer.invoke('history:recent', limit, taskId ?? null)
  },
  focus: {
    start: (draft: FocusSessionStartDraft): Promise<FocusSession> =>
      ipcRenderer.invoke('focus:start', draft),
    complete: (id: string, patch: FocusSessionCompletePatch): Promise<FocusSession | null> =>
      ipcRenderer.invoke('focus:complete', id, patch),
    recent: (limit: number, taskId?: string | null): Promise<FocusSession[]> =>
      ipcRenderer.invoke('focus:recent', limit, taskId ?? null)
  },
  trail: {
    record: (draft: ActivityRecordDraft): Promise<void> =>
      ipcRenderer.invoke('trail:record', draft),
    recent: (
      taskId: string | null,
      sinceMs: number,
      limit: number
    ): Promise<ActivityEvent[]> => ipcRenderer.invoke('trail:recent', taskId, sinceMs, limit),
    summarize: (taskId: string | null, sinceMs: number): Promise<TrailSummaryResponse> =>
      ipcRenderer.invoke('trail:summarize', taskId, sinceMs)
  },
  model: {
    get: (): Promise<ModelMode> => ipcRenderer.invoke('model:get'),
    set: (mode: ModelMode): Promise<void> => ipcRenderer.invoke('model:set', mode)
  },
  bodyDouble: {
    tick: (taskId: string | null, recentMessages: string[]): Promise<BodyDoubleResponse> =>
      ipcRenderer.invoke('bodyDouble:tick', taskId, recentMessages)
  },
  smartStack: {
    propose: (taskId: string): Promise<SmartStackResponse> =>
      ipcRenderer.invoke('smartStack:propose', taskId)
  },
  connectedApps: {
    list: (): Promise<ConnectedApp[]> => ipcRenderer.invoke('connectedApps:list'),
    create: (draft: ConnectedAppDraft): Promise<ConnectedApp> =>
      ipcRenderer.invoke('connectedApps:create', draft),
    update: (id: string, patch: ConnectedAppPatch): Promise<ConnectedApp | null> =>
      ipcRenderer.invoke('connectedApps:update', id, patch),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('connectedApps:delete', id),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke('connectedApps:reorder', ids),
    touch: (id: string): Promise<ConnectedApp | null> =>
      ipcRenderer.invoke('connectedApps:touch', id),
    findByHostname: (hostname: string): Promise<ConnectedApp | null> =>
      ipcRenderer.invoke('connectedApps:findByHostname', hostname)
  },
  webview: {
    // Fired when a <webview> inside a connected app or canvas widget tries to
    // open a target=_blank link. The renderer turns these into canvas widgets
    // so users keep clicked links inside FocusBuddy.
    onLinkClicked: (
      cb: (payload: { sourceWebContentsId: number; url: string }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        payload: { sourceWebContentsId: number; url: string }
      ): void => cb(payload)
      ipcRenderer.on('webview:link-clicked', handler)
      return () => ipcRenderer.removeListener('webview:link-clicked', handler)
    }
  },
  localApp: {
    // Opens the macOS file picker filtered to .app bundles; returns null if
    // the user cancels.
    pick: (): Promise<{
      title: string
      appPath: string
      bundleId: string | null
      iconPngBase64: string | null
    } | null> => ipcRenderer.invoke('localApp:pick'),
    describe: (
      appPath: string
    ): Promise<{
      title: string
      appPath: string
      bundleId: string | null
      iconPngBase64: string | null
    } | null> => ipcRenderer.invoke('localApp:describe', appPath),
    launch: (input: {
      appPath: string | null
      bundleId: string | null
      title?: string
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('localApp:launch', input),
    isRunning: (input: {
      appPath: string | null
      title: string
    }): Promise<boolean> => ipcRenderer.invoke('localApp:isRunning', input),
    refreshIcon: (appPath: string): Promise<string | null> =>
      ipcRenderer.invoke('localApp:refreshIcon', appPath)
  },
  dashboard: {
    getLayout: (key: string): Promise<DashboardLayout | null> =>
      ipcRenderer.invoke('dashboard:getLayout', key),
    setLayout: (
      key: string,
      cardIds: DashboardCardKind[]
    ): Promise<DashboardLayout> =>
      ipcRenderer.invoke('dashboard:setLayout', key, cardIds),
    resetLayout: (key: string): Promise<boolean> =>
      ipcRenderer.invoke('dashboard:resetLayout', key)
  },
  haptics: {
    available: (): Promise<boolean> => ipcRenderer.invoke('haptics:available'),
    fire: (feel: HapticFeel): Promise<boolean> => ipcRenderer.invoke('haptics:fire', feel)
  },
  energy: {
    log: (level: EnergyLevel): Promise<EnergyLogEntry> =>
      ipcRenderer.invoke('energy:log', level),
    current: (): Promise<EnergyLogEntry | null> =>
      ipcRenderer.invoke('energy:current'),
    recent: (hours: number): Promise<EnergyLogEntry[]> =>
      ipcRenderer.invoke('energy:recent', hours)
  },
  vault: {
    meta: (): Promise<VaultMeta> => ipcRenderer.invoke('vault:meta'),
    isUnlocked: (): Promise<boolean> => ipcRenderer.invoke('vault:isUnlocked'),
    create: (masterPassword: string): Promise<VaultResult> =>
      ipcRenderer.invoke('vault:create', masterPassword),
    unlock: (masterPassword: string): Promise<VaultResult> =>
      ipcRenderer.invoke('vault:unlock', masterPassword),
    lock: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
    listEntries: (): Promise<VaultEntryStored[]> =>
      ipcRenderer.invoke('vault:listEntries'),
    createEntry: (draft: VaultEntryDraft): Promise<VaultEntryStored | null> =>
      ipcRenderer.invoke('vault:createEntry', draft),
    updateEntry: (
      id: string,
      patch: VaultEntryPatch
    ): Promise<VaultEntryStored | null> =>
      ipcRenderer.invoke('vault:updateEntry', id, patch),
    deleteEntry: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('vault:deleteEntry', id),
    encrypt: (
      plaintext: string
    ): Promise<{ iv: string; ciphertext: string } | null> =>
      ipcRenderer.invoke('vault:encrypt', plaintext),
    decrypt: (iv: string, ciphertext: string): Promise<string | null> =>
      ipcRenderer.invoke('vault:decrypt', iv, ciphertext)
  },
  templates: {
    list: (): Promise<Template[]> => ipcRenderer.invoke('templates:list'),
    createFromTask: (
      taskId: string,
      name: string,
      description?: string,
      widgetIds?: string[]
    ): Promise<Template> =>
      ipcRenderer.invoke(
        'templates:createFromTask',
        taskId,
        name,
        description,
        widgetIds
      ),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('templates:delete', id)
  },
  contextMenu: {
    onAction: (cb: (payload: ContextMenuPayload) => void): (() => void) => {
      const handler = (_: unknown, payload: ContextMenuPayload): void => cb(payload)
      ipcRenderer.on('context-menu:action', handler)
      return () => ipcRenderer.removeListener('context-menu:action', handler)
    }
  },
  // Cross-window IPC bus used by the body-double BridgeMatcher. Two
  // FocusBuddy windows on the same machine share this channel — main
  // process broadcasts everything one renderer sends to every other.
  bodyDoubleBus: {
    send: (payload: unknown): void => {
      ipcRenderer.send('fb:body-double-bus', payload)
    },
    onMessage: (cb: (payload: unknown) => void): (() => void) => {
      const handler = (_: unknown, payload: unknown): void => cb(payload)
      ipcRenderer.on('fb:body-double-bus', handler)
      return () => ipcRenderer.removeListener('fb:body-double-bus', handler)
    }
  },
  files: {
    // Ingest from a path on disk (Electron drag-drop gives us .path on File).
    ingestPath: (sourcePath: string): Promise<FbFile> =>
      ipcRenderer.invoke('files:ingestPath', sourcePath),
    // Ingest from raw bytes (HTML5 drag-drop without a path, or paste).
    ingestBuffer: (input: {
      buffer: ArrayBuffer
      originalName: string
      mimeType: string
    }): Promise<FbFile> => ipcRenderer.invoke('files:ingestBuffer', input),
    get: (id: string): Promise<FbFile | null> => ipcRenderer.invoke('files:get', id),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('files:delete', id),
    // Read raw bytes back — used for previews that can't reference a file://
    // URL directly (e.g. images with content-security-policy restrictions).
    read: (
      id: string
    ): Promise<{ mimeType: string; buffer: ArrayBuffer } | null> =>
      ipcRenderer.invoke('files:read', id),
    // Open the native file picker + ingest the chosen file in one round-trip.
    // Returns null when the user cancels.
    pickAndIngest: (opts?: {
      title?: string
      defaultPath?: string
    }): Promise<FbFile | null> => ipcRenderer.invoke('files:pickAndIngest', opts),
    // Generate (or read from cache) a QuickLook-backed PNG thumbnail for any
    // ingested file. Works for images, PDFs, Office docs, Keynote, etc. —
    // anything Finder's preview can render.
    thumbnail: (
      id: string,
      opts?: { size?: number }
    ): Promise<{
      base64: string
      mimeType: 'image/png'
      width: number
      height: number
    } | null> => ipcRenderer.invoke('files:thumbnail', id, opts),
    // Open a local file in the user's default app (Preview/Word/VS Code/etc.)
    open: (id: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('files:open', id),
    // Open a remote URL in the user's default browser. http:/https: only.
    openExternal: (
      url: string
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('files:openExternal', url)
  },
  // Voice / video note AI pipeline. Three independent stages — record
  // → transcribe, transcript → processed text, transcript → action
  // proposals. Each returns a tagged-union result; renderer branches on
  // `ok` to either show the success payload or a "set your key" /
  // "network error" affordance.
  voiceNote: {
    // Transcription IPC. Cloud provider needs `buffer` + `mimeType`;
    // local provider needs pre-decoded `samples` (Float32Array, 16kHz
    // mono PCM) + `sampleRate`. The renderer should branch on
    // getProvider() and only decode for the local path — decoding for
    // cloud would be wasted work (Whisper API accepts webm/opus
    // directly and the raw bytes are 5-10x smaller over IPC).
    transcribe: (input: {
      buffer?: ArrayBuffer
      mimeType?: string
      samples?: Float32Array
      sampleRate?: number
    }): Promise<
      | {
          ok: true
          transcript: string
          durationSec: number | null
          language: string | null
        }
      | { ok: false; error: string; reason?: 'no_key' | 'network' | 'api' | 'unknown' | 'model_load' | 'decode' }
    > => ipcRenderer.invoke('ai:transcribeAudio', input),
    process: (input: {
      transcript: string
      mode: 'full' | 'cleaned' | 'summary' | 'diarised'
    }): Promise<
      | { ok: true; mode: 'full' | 'cleaned' | 'summary' | 'diarised'; text: string }
      | { ok: false; error: string; reason?: 'no_key' | 'api' | 'unknown' }
    > => ipcRenderer.invoke('ai:processTranscript', input),
    extractActions: (input: { transcript: string }): Promise<
      | { ok: true; proposals: ActionProposal[] }
      | { ok: false; error: string; reason?: 'no_key' | 'api' | 'parse' }
    > => ipcRenderer.invoke('ai:extractActionsFromTranscript', input),
    // Provider preference — 'cloud' = OpenAI Whisper API,
    // 'local' = on-device ONNX Whisper tiny (downloads ~80MB on first
    // selection). Calling setProvider('local') preloads the model so
    // the first recording isn't blocked on the download.
    getProvider: (): Promise<'cloud' | 'local'> =>
      ipcRenderer.invoke('voice:getProvider'),
    setProvider: (
      p: 'cloud' | 'local'
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('voice:setProvider', p)
  },
  // Voice command — floating mic interpreter. Takes a transcript plus a
  // pruned canvas snapshot and returns ActionProposal[] for the user to
  // review. Same Apply/Dismiss UX as the existing AI assistants.
  voiceCommand: {
    run: (input: {
      transcript: string
      activeTaskId: string | null
      selectedWidgetId: string | null
      widgets: Array<{
        id: string
        kind: string
        title: string
        contentPreview: string
        selected?: boolean
        recentlyTouched?: boolean
        visible?: boolean
      }>
    }): Promise<
      | { ok: true; reply: string; proposals: ActionProposal[] }
      | {
          ok: false
          error: string
          reason?: 'no_key' | 'empty_transcript' | 'no_proposals' | 'api' | 'parse'
        }
    > => ipcRenderer.invoke('voiceCommand:run', input),
    getPrefs: (): Promise<{
      commandMode: 'press-hold' | 'click-toggle'
      autoStopSilenceMs: number
      voiceback: boolean
    }> => ipcRenderer.invoke('voiceCommand:getPrefs'),
    setPrefs: (
      patch: Partial<{
        commandMode: 'press-hold' | 'click-toggle'
        autoStopSilenceMs: number
        voiceback: boolean
      }>
    ): Promise<{
      commandMode: 'press-hold' | 'click-toggle'
      autoStopSilenceMs: number
      voiceback: boolean
    }> => ipcRenderer.invoke('voiceCommand:setPrefs', patch),
    // Streaming variant — caller mints a requestId and listens on the
    // per-request channel. Returns a cleanup function to unsubscribe.
    runStream: (
      input: {
        requestId: string
        transcript: string
        activeTaskId: string | null
        selectedWidgetId: string | null
        widgets: Array<{
          id: string
          kind: string
          title: string
          contentPreview: string
          selected?: boolean
          recentlyTouched?: boolean
          visible?: boolean
        }>
      },
      callbacks: {
        onReply?: (text: string) => void
        onProposal?: (proposal: ActionProposal) => void
        onError?: (error: { ok: false; error: string; reason?: string }) => void
        onComplete?: (summary: { totalProposals: number; replyText: string }) => void
      }
    ): (() => void) => {
      const channel = `voiceCommand:stream:${input.requestId}`
      type Event =
        | { type: 'reply'; payload: string }
        | { type: 'proposal'; payload: ActionProposal }
        | { type: 'error'; payload: { ok: false; error: string; reason?: string } }
        | { type: 'complete'; payload: { totalProposals: number; replyText: string } }
      const handler = (_: unknown, ev: Event): void => {
        switch (ev.type) {
          case 'reply':
            callbacks.onReply?.(ev.payload)
            break
          case 'proposal':
            callbacks.onProposal?.(ev.payload)
            break
          case 'error':
            callbacks.onError?.(ev.payload)
            break
          case 'complete':
            callbacks.onComplete?.(ev.payload)
            break
        }
      }
      ipcRenderer.on(channel, handler)
      // Kick off the stream. We deliberately fire-and-forget — the
      // events handle the result; the invoke promise just keeps the
      // request alive on the main side until it resolves.
      void ipcRenderer.invoke('voiceCommand:runStream', input)
      // Braces so the cleanup arrow returns void — ipcRenderer.removeListener
      // returns the IpcRenderer instance, which a `(): void =>` concise body
      // would otherwise try (and fail) to return.
      return (): void => {
        ipcRenderer.removeListener(channel, handler)
      }
    }
  },
  // Phase 2A — agent creation wizard. Writes a brand-new agent .md
  // file to .claude/agents/ with a Claude-generated body following
  // the kit's conventions. Phase 2C — single-turn agent invocation
  // returning ActionProposal[] for review-and-apply.
  agents: {
    // Desk agents (canvas widget): run a placed agent's standing instruction
    // over the widgets wired into it. Distinct from the Agent OS create/invoke
    // flow below.
    run: (
      agentId: string,
      taskId: string,
      instruction: string,
      liveInputs?: Record<string, string>,
      persona?: string,
      browserWcId?: number
    ): Promise<{
      ok: boolean
      output?: string
      needsApiKey?: boolean
      error?: string
    }> =>
      ipcRenderer.invoke('agents:run', agentId, taskId, instruction, liveInputs, persona, browserWcId),
    designProfile: (
      description: string
    ): Promise<{
      ok: boolean
      name?: string
      blurb?: string
      systemPrompt?: string
      needsApiKey?: boolean
      error?: string
    }> => ipcRenderer.invoke('agents:designProfile', description),
    previewInput: (widgetId: string): Promise<{ kind?: string; content: string }> =>
      ipcRenderer.invoke('agents:previewInput', widgetId),
    create: (input: {
      slug: string
      description: string
      model: 'haiku' | 'sonnet' | 'opus'
      tools: Array<
        'Read' | 'Write' | 'Edit' | 'Bash' | 'Glob' | 'Grep' | 'WebFetch' | 'WebSearch' | 'Agent'
      >
      purpose: string
      contextPath?: string[]
    }): Promise<
      | { ok: true; slug: string; path: string }
      | {
          ok: false
          error: string
          reason?: 'no_key' | 'api' | 'fs' | 'exists' | 'no_workspace'
        }
    > => ipcRenderer.invoke('agents:create', input),
    invoke: (input: {
      agentPath: string
      rootPath: string[]
      nodeLabel: string
      nodeKind: string
      userMessage: string
      // Phase 2 polish — multi-turn conversation. Pass prior history
      // for follow-up turns; omit for the initial invocation. Hard
      // cap of 5 round-trips enforced server-side; the response's
      // conversationCapped flag signals when the renderer should
      // disable further replies.
      conversationHistory?: Array<{ role: 'user' | 'agent'; content: string }>
      conversationKey?: string
      nodeId?: string | null
    }): Promise<
      | {
          ok: true
          agentName: string
          reply: string
          proposals: ActionProposal[]
          invocationId: string
          conversationTurn: number
          conversationCapped: boolean
        }
      | {
          ok: false
          error: string
          reason?: 'no_key' | 'agent_not_found' | 'agent_unreadable' | 'api' | 'parse'
        }
    > => ipcRenderer.invoke('agents:invoke', input),
    // Outcome bookkeeping — applied / dismissed / undone. Drives the
    // per-agent stats and "undo last apply" affordances.
    recordOutcome: (input: {
      invocationId: string
      agentSlug: string
      proposalId: string
      proposalKind: string
      action: 'applied' | 'dismissed' | 'undone'
      createdEntityRef?: string | null
    }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('agents:recordOutcome', input),
    listInvocationsForNode: (
      nodeId: string
    ): Promise<
      Array<{
        id: string
        agentSlug: string
        agentName: string
        nodeId: string | null
        nodeLabel: string
        rootPath: string[]
        reply: string
        proposals: ActionProposal[]
        conversationTurn: number
        conversationKey: string
        invokedAt: number
      }>
    > => ipcRenderer.invoke('agents:listInvocationsForNode', nodeId),
    statsForSlug: (
      slug: string
    ): Promise<{
      slug: string
      invocations: number
      totalProposals: number
      applied: number
      dismissed: number
      undone: number
      applyRate: number
    }> => ipcRenderer.invoke('agents:statsForSlug', slug),
    undoLast: (): Promise<{
      ok: boolean
      message: string
      entityRef?: string | null
    }> => ipcRenderer.invoke('agents:undoLast'),
    // Workspace path override — when set, the resolver pushes this
    // path to the front of its probe list. Used by Settings to let
    // users point Haptyx at their workspace if auto-detect missed it.
    getWorkspaceOverride: (): Promise<string | null> =>
      ipcRenderer.invoke('agents:getWorkspaceOverride'),
    setWorkspaceOverride: (
      path: string
    ): Promise<{ ok: true }> =>
      ipcRenderer.invoke('agents:setWorkspaceOverride', path),
    // Reveal a path in Finder. Wraps shell.showItemInFolder so the
    // renderer can offer "show me where Haptyx is reading agents from"
    // affordances without needing the Electron API directly.
    revealInFinder: (
      path: string
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('agents:revealInFinder', path)
  },
  // Mind-mapper AI pipeline. Three thin wrappers over Claude:
  //   expand → child branches for a node
  //   listAgents → static enumeration of .claude/agents/*.md
  //   suggestAgents → Claude-ranked top picks for a node
  mindmap: {
    expand: (input: {
      rootPath: string[]
      nodeLabel: string
      nodeKind?: 'idea' | 'task' | 'question' | 'tool' | 'agent'
      guidance?: string
    }): Promise<
      | {
          ok: true
          children: Array<{
            id: string
            label: string
            kind: 'idea' | 'task' | 'question' | 'tool' | 'agent'
            rationale?: string
          }>
        }
      | { ok: false; error: string; reason?: 'no_key' | 'api' | 'parse' }
    > => ipcRenderer.invoke('mindmap:expand', input),
    listAgents: (): Promise<{
      source:
        | 'override'
        | 'workspace'
        | 'userData-existing'
        | 'userData-new'
        | 'none'
      agentsDir: string | null
      workspaceRoot: string | null
      agents: Array<{ slug: string; path: string; name: string; description: string }>
    }> => ipcRenderer.invoke('mindmap:listAgents'),
    suggestAgents: (input: {
      rootPath: string[]
      nodeLabel: string
      nodeKind?: 'idea' | 'task' | 'question' | 'tool' | 'agent'
      candidates: Array<{ slug: string; path: string; name: string; description: string }>
    }): Promise<
      | {
          ok: true
          suggestions: Array<{ slug: string; name: string; rationale: string }>
        }
      | { ok: false; error: string; reason?: 'no_key' | 'api' | 'parse' | 'no_agents' }
    > => ipcRenderer.invoke('mindmap:suggestAgents', input)
  },
  tables: {
    list: (): Promise<FbTable[]> => ipcRenderer.invoke('tables:list'),
    get: (id: string): Promise<FbTable | null> => ipcRenderer.invoke('tables:get', id),
    create: (draft: FbTableDraft): Promise<FbTable> =>
      ipcRenderer.invoke('tables:create', draft),
    update: (id: string, patch: FbTablePatch): Promise<FbTable | null> =>
      ipcRenderer.invoke('tables:update', id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('tables:delete', id),
    listRows: (tableId: string): Promise<FbRow[]> =>
      ipcRenderer.invoke('tables:listRows', tableId),
    createRow: (draft: FbRowDraft): Promise<FbRow> =>
      ipcRenderer.invoke('tables:createRow', draft),
    updateRow: (id: string, patch: FbRowPatch): Promise<FbRow | null> =>
      ipcRenderer.invoke('tables:updateRow', id, patch),
    deleteRow: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('tables:deleteRow', id),
    reorderRows: (tableId: string, ids: string[]): Promise<void> =>
      ipcRenderer.invoke('tables:reorderRows', tableId, ids)
  },
  // Settings — API-key vault. Replaces the old "edit .env and restart"
  // flow. Plaintext only travels renderer→main on save; reads return
  // `{ hasKey, last4 }` so the UI can render a confirmation badge
  // without ever holding the secret in renderer memory.
  settings: {
    encryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('settings:encryptionAvailable'),
    hintAnthropic: (): Promise<{ hasKey: boolean; last4: string | null }> =>
      ipcRenderer.invoke('settings:hintAnthropic'),
    saveAnthropicKey: (
      plaintext: string
    ): Promise<{ ok: boolean; hasKey?: boolean; last4?: string | null; error?: string }> =>
      ipcRenderer.invoke('settings:saveAnthropicKey', plaintext),
    clearAnthropicKey: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:clearAnthropicKey'),
    testAnthropicKey: (): Promise<{ ok: boolean; model?: string; error?: string }> =>
      ipcRenderer.invoke('settings:testAnthropicKey'),
    // OpenAI key — used by the audio transcription pipeline (Whisper API).
    // Mirror the Anthropic surface 1:1 so the ApiKeysSection UI can render
    // both with one shared row component.
    hintOpenAI: (): Promise<{ hasKey: boolean; last4: string | null }> =>
      ipcRenderer.invoke('settings:hintOpenAI'),
    saveOpenAIKey: (
      plaintext: string
    ): Promise<{ ok: boolean; hasKey?: boolean; last4?: string | null; error?: string }> =>
      ipcRenderer.invoke('settings:saveOpenAIKey', plaintext),
    clearOpenAIKey: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:clearOpenAIKey'),
    testOpenAIKey: (): Promise<{ ok: boolean; model?: string; error?: string }> =>
      ipcRenderer.invoke('settings:testOpenAIKey')
  },
  // haptyx:// deep-link auth handoff. The brochure at haptyx.app/account/*
  // signs the user in against the signal server, then redirects to
  // haptyx://auth?token=...&email=...&handle=... — main process catches
  // that URL and forwards it here. The renderer either gets the token
  // immediately via `onIncomingToken`, or drains the pending one via
  // `getPending` on mount (cold-start case).
  auth: {
    getPending: (): Promise<{
      sessionToken: string
      email: string | null
      handle: string | null
      origin: 'open-url' | 'argv' | 'second-instance'
    } | null> => ipcRenderer.invoke('auth:get-pending'),
    onIncomingToken: (
      cb: (handoff: {
        sessionToken: string
        email: string | null
        handle: string | null
        origin: 'open-url' | 'argv' | 'second-instance'
      }) => void
    ): (() => void) => {
      const handler = (_: unknown, handoff: {
        sessionToken: string
        email: string | null
        handle: string | null
        origin: 'open-url' | 'argv' | 'second-instance'
      }): void => cb(handoff)
      ipcRenderer.on('auth:incoming-token', handler)
      return () => ipcRenderer.removeListener('auth:incoming-token', handler)
    }
  },
  // File import — opens a native picker scoped to importable extensions,
  // then converts the contents into a widget draft (text / table /
  // page-from-json). The renderer creates the actual widget through the
  // widget store so import shares the same persistence + drop semantics
  // as a manually-created widget.
  fileImport: {
    pick: (): Promise<string | null> => ipcRenderer.invoke('fileImport:pick'),
    run: (args: {
      path: string
      preferredTextKind?: 'page' | 'markdown' | 'note'
    }): Promise<
      | {
          kind: 'text'
          targetKind: 'page' | 'markdown' | 'note'
          title: string
          content: string
          sourcePath: string
        }
      | {
          kind: 'table'
          title: string
          schema: import('@shared/fields').TableSchema
          rows: Array<Record<string, string>>
          sourcePath: string
        }
      | {
          kind: 'page-from-json'
          title: string
          content: string
          sourcePath: string
        }
      | {
          ok: false
          error: string
          reason: 'cancelled' | 'unsupported' | 'parse' | 'read' | 'docx_not_supported'
        }
    > => ipcRenderer.invoke('fileImport:run', args)
  },
  // Auto-update bridge. Renderer reads the snapshot via getState on
  // mount, then subscribes via onState to receive every transition.
  update: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
    check: (): Promise<{ ok: true }> => ipcRenderer.invoke('update:check'),
    installAndRestart: (): Promise<{ ok: true }> => ipcRenderer.invoke('update:install-and-restart'),
    onState: (cb: (state: UpdateState) => void): (() => void) => {
      const handler = (_: unknown, s: UpdateState): void => cb(s)
      ipcRenderer.on('update:state', handler)
      return () => ipcRenderer.removeListener('update:state', handler)
    }
  }
}

// Mirror of UpdateState from main/autoUpdate.ts. Kept in sync by hand —
// only six variants and the field shapes are tiny, so a shared types
// module would be heavier than it's worth.
export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; releaseNotes?: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string; releaseNotes?: string }
  | { kind: 'none'; currentVersion: string }
  | { kind: 'error'; message: string }

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('preload contextBridge error:', error)
}

export type Api = typeof api
