import { contextBridge, ipcRenderer } from 'electron'
import type {
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
  WidgetPatch
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
      taskId: string
    ): Promise<WidgetLink | null> =>
      ipcRenderer.invoke('widgetLinks:create', sourceWidgetId, targetWidgetId, taskId),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('widgetLinks:delete', id)
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
      ipcRenderer.invoke('files:read', id)
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
  }
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('preload contextBridge error:', error)
}

export type Api = typeof api
