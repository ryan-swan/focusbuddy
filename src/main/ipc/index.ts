import { ipcMain, BrowserWindow, type WebContents } from 'electron'
import {
  createNode,
  deleteNode,
  getNode,
  listNodes,
  moveNode,
  updateNode
} from '../db/nodes'
import {
  bringToFront,
  createWidget,
  deleteWidget,
  listWidgetsByTask,
  updateWidget
} from '../db/widgets'
import { createLink, deleteLink, listLinksByTask } from '../db/widgetLinks'
import {
  clearSession,
  loadAccountState,
  saveSession,
  setCachedEmail,
  setSkipped
} from '../db/account'
import {
  executeAction,
  openAccessibilitySettings,
  openSettingsAppPlain,
  revealAppBundleInFinder,
  type ExecuteResult
} from '../streamdeckActions'
import { loadUniversalDeck, saveUniversalDeck } from '../db/speeddeck'
import type { StreamDeckAction } from '@shared/streamdeck'
import {
  acceptShare,
  createShareLink,
  deleteShareLink,
  listAllShareLinks,
  listShareLinksForEntity,
  listSharedWithMe,
  removeSharedItem,
  revokeShareLink
} from '../db/shares'
import {
  createTemplateFromTask,
  deleteTemplate,
  listTemplates
} from '../db/templates'
import { getRecentHistory, recordVisit } from '../db/browsing'
import {
  createConnectedApp,
  deleteConnectedApp,
  findConnectedAppByHostname,
  listConnectedApps,
  reorderConnectedApps,
  touchConnectedApp,
  updateConnectedApp
} from '../db/connectedApps'
import {
  describeLocalApp,
  isLocalAppRunning,
  launchLocalApp,
  pickLocalApp,
  refreshAppIcon
} from '../localApps'
import {
  deleteFile,
  getFile,
  ingestFromBuffer,
  ingestFromPath,
  readFileBytes
} from '../db/files'
import {
  createRow,
  createTable,
  deleteRow,
  deleteTable,
  getTable,
  listRows,
  listTables,
  reorderRows,
  updateRow,
  updateTable
} from '../db/tables'
import type {
  FbRowDraft,
  FbRowPatch,
  FbTableDraft,
  FbTablePatch
} from '@shared/fields'
import {
  deleteDashboardLayout,
  getDashboardLayout,
  setDashboardLayout
} from '../db/dashboardLayouts'
import { currentEnergy, logEnergy, recentEnergy } from '../db/energy'
import { fireHaptic, isHapticsAvailable, type HapticFeel } from '../haptics'
import {
  createEntry,
  createVault,
  decryptWithMaster,
  deleteEntry,
  encryptWithMaster,
  getVaultMeta,
  isUnlocked,
  listEntries,
  lockVault,
  unlockVault,
  updateEntry
} from '../db/vault'
import {
  completeFocusSession,
  listRecentSessions,
  startFocusSession
} from '../db/focusSessions'
import { getRecentActivity, recordActivity } from '../db/activity'
import {
  generatePresenceNarration,
  generateProactiveWelcome,
  buildFromPrompt,
  generateResume,
  proposeSmartStacks,
  regenerateLivingPage,
  sendChat,
  suggestPageContent,
  suggestSetupWidgets,
  suggestTableRows,
  summarizeRecentTrail
} from '../ai/anthropic'
import { getModelMode, setModelMode } from '../ai/modelRouting'
import type {
  ActivityRecordDraft,
  ChatRequest,
  ConnectedAppDraft,
  ConnectedAppPatch,
  DashboardCardKind,
  EnergyLevel,
  FocusSessionCompletePatch,
  FocusSessionStartDraft,
  ModelMode,
  NodeDraft,
  NodePatch,
  VaultEntryDraft,
  VaultEntryPatch,
  WidgetDraft,
  WidgetPatch
} from '@shared/types'

export function registerIpcHandlers(): void {
  // ── Body-double cross-window relay ──────────────────────────────────────
  // BroadcastChannel is per-renderer-process — fine for two browser tabs,
  // useless for two Electron windows. The bridge below lets the local-mock
  // matcher work across multiple FocusBuddy windows on the same machine:
  // when one renderer sends a `fb:body-double-bus` message, main forwards
  // it to every OTHER renderer. The wire format is whatever the matcher
  // wants — main treats payloads as opaque blobs.
  ipcMain.on('fb:body-double-bus', (event, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const wc: WebContents = win.webContents
      if (wc.id === event.sender.id) continue
      try {
        wc.send('fb:body-double-bus', payload)
      } catch {
        // window may have closed mid-broadcast — ignore
      }
    }
  })

  ipcMain.handle('nodes:list', () => listNodes())
  ipcMain.handle('nodes:get', (_e, id: string) => getNode(id))
  ipcMain.handle('nodes:create', (_e, draft: NodeDraft) => createNode(draft))
  ipcMain.handle('nodes:update', (_e, id: string, patch: NodePatch) => updateNode(id, patch))
  ipcMain.handle('nodes:delete', (_e, id: string) => deleteNode(id))
  ipcMain.handle(
    'nodes:move',
    (_e, id: string, newParentId: string | null, beforeId: string | null) =>
      moveNode(id, newParentId, beforeId)
  )

  ipcMain.handle('widgets:listByTask', (_e, taskId: string) => listWidgetsByTask(taskId))
  ipcMain.handle('widgets:create', (_e, draft: WidgetDraft) => createWidget(draft))
  ipcMain.handle('widgets:update', (_e, id: string, patch: WidgetPatch) => updateWidget(id, patch))
  ipcMain.handle('widgets:delete', (_e, id: string) => deleteWidget(id))
  ipcMain.handle('widgets:bringToFront', (_e, id: string) => bringToFront(id))

  ipcMain.handle('widgetLinks:listByTask', (_e, taskId: string) => listLinksByTask(taskId))

  // Share-link CRUD
  ipcMain.handle('shares:listAll', () => listAllShareLinks())
  ipcMain.handle(
    'shares:listForEntity',
    (_e, kind: 'folder' | 'task' | 'widget', entityId: string) =>
      listShareLinksForEntity(kind, entityId)
  )
  ipcMain.handle(
    'shares:create',
    (
      _e,
      input: {
        token: string
        kind: 'folder' | 'task' | 'widget'
        entityId: string
        label: string
        scope: 'view' | 'copy'
        expiresAt: number | null
      }
    ) => createShareLink(input)
  )
  ipcMain.handle('shares:revoke', (_e, id: string) => revokeShareLink(id))
  ipcMain.handle('shares:delete', (_e, id: string) => deleteShareLink(id))
  // "Shared with me" inbox
  ipcMain.handle('shares:inbox', () => listSharedWithMe())
  ipcMain.handle(
    'shares:accept',
    (
      _e,
      input: {
        token: string
        kind: 'folder' | 'task' | 'widget'
        snapshot: unknown
        fromHandle: string
        scope: 'view' | 'copy'
      }
    ) => acceptShare(input)
  )
  ipcMain.handle('shares:removeInbox', (_e, id: string) => removeSharedItem(id))

  // Account session — load/save/clear via main-process safeStorage. The
  // renderer never sees the encryption key or the file path. Skipped is
  // a separate boolean used by the launch modal to remember "user
  // dismissed me" between launches.
  ipcMain.handle('account:load', () => loadAccountState())
  ipcMain.handle(
    'account:saveSession',
    (_e, input: { token: string; email: string | null }) =>
      saveSession(input.token, input.email)
  )
  ipcMain.handle('account:clearSession', () => clearSession())
  ipcMain.handle('account:setSkipped', (_e, skipped: boolean) => setSkipped(skipped))
  ipcMain.handle('account:setCachedEmail', (_e, email: string | null) =>
    setCachedEmail(email)
  )

  // Stream Deck — single execute endpoint takes any action (single or
  // multi-step) and runs it. Returns {ok, error?} for the renderer to
  // surface on the button.
  ipcMain.handle(
    'streamdeck:execute',
    (_e, action: StreamDeckAction): Promise<ExecuteResult> => executeAction(action)
  )
  ipcMain.handle('streamdeck:openAccessibilitySettings', () =>
    openAccessibilitySettings()
  )
  // Lets the renderer ask "are we trusted for accessibility right now?"
  // Used so the dialog can stop nagging once the user has flipped the
  // toggle in System Settings, without requiring a restart.
  ipcMain.handle('streamdeck:checkAccessibility', () => {
    if (process.platform !== 'darwin') return true
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { systemPreferences } = require('electron')
      return systemPreferences.isTrustedAccessibilityClient(false)
    } catch {
      return false
    }
  })
  // Triggers macOS's NATIVE accessibility permission prompt. This is the
  // canonical way every Mac app gets accessibility — passing `true`
  // makes macOS itself show the standard system dialog with a working
  // "Open System Settings" button that goes to the exact right pane.
  // No URL scheme guessing, no password manager hijack risk. The dialog
  // only shows once per app launch and only if not already trusted, so
  // the renderer should call this ONCE when the user clicks "Open
  // System Settings" — after that, falls back to opening Settings
  // manually if the user dismissed it.
  ipcMain.handle('streamdeck:promptAccessibility', () => {
    if (process.platform !== 'darwin') return true
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { systemPreferences } = require('electron')
      return systemPreferences.isTrustedAccessibilityClient(true)
    } catch {
      return false
    }
  })
  // Bulletproof: open System Settings (or System Preferences) by app
  // name with NO URL scheme involved. No deep-linking, no password
  // manager hijack, no pane id guessing. The user navigates manually
  // using the modal's instructions.
  ipcMain.handle('streamdeck:openSettingsApp', () => openSettingsAppPlain())
  // Reveal the running app's .app bundle in Finder so the user can
  // drag it into the Accessibility list. In dev mode this is
  // Electron.app; in production it's FocusBuddy.app.
  ipcMain.handle('streamdeck:revealAppInFinder', () => revealAppBundleInFinder())
  // Universal SpeedDeck — same buttons across every task, every folder.
  // The renderer reads on widget mount and writes on every edit; this
  // way every SpeedDeck widget set to "Universal" scope shares the
  // same persistent deck.
  ipcMain.handle('speeddeck:loadUniversal', () => loadUniversalDeck())
  ipcMain.handle('speeddeck:saveUniversal', (_e, json: string) =>
    saveUniversalDeck(json)
  )

  ipcMain.handle(
    'widgetLinks:create',
    (_e, sourceWidgetId: string, targetWidgetId: string, taskId: string) =>
      createLink(sourceWidgetId, targetWidgetId, taskId)
  )
  ipcMain.handle('widgetLinks:delete', (_e, id: string) => deleteLink(id))

  ipcMain.handle('templates:list', () => listTemplates())
  ipcMain.handle(
    'templates:createFromTask',
    (
      _e,
      taskId: string,
      name: string,
      description?: string,
      widgetIds?: string[]
    ) => createTemplateFromTask(taskId, name, description, widgetIds)
  )
  ipcMain.handle('templates:delete', (_e, id: string) => deleteTemplate(id))

  ipcMain.handle('chat:send', (_e, req: ChatRequest) => sendChat(req))
  ipcMain.handle('chat:hasApiKey', () => Boolean(process.env.ANTHROPIC_API_KEY))
  ipcMain.handle('chat:proactiveWelcome', (_e, taskId: string) =>
    generateProactiveWelcome(taskId)
  )
  ipcMain.handle('resume:generate', (_e, taskId: string) => generateResume(taskId))
  ipcMain.handle('setup:suggest', (_e, taskId: string) => suggestSetupWidgets(taskId))
  ipcMain.handle(
    'setup:buildFromPrompt',
    (_e, input: { prompt: string; taskId: string | null }) =>
      buildFromPrompt(input)
  )
  ipcMain.handle('livingPage:regenerate', (_e, widgetId: string) =>
    regenerateLivingPage(widgetId)
  )
  ipcMain.handle('ai:suggestPageContent', (_e, prompt: string) =>
    suggestPageContent(prompt)
  )
  ipcMain.handle(
    'ai:suggestTableRows',
    (_e, tableId: string, prompt: string, count: number) =>
      suggestTableRows(tableId, prompt, count)
  )

  ipcMain.handle(
    'history:record',
    (_e, url: string, title: string, taskId: string | null) =>
      recordVisit(url, title, taskId)
  )
  ipcMain.handle('history:recent', (_e, limit: number, taskId?: string | null) =>
    getRecentHistory(limit, taskId ?? null)
  )

  ipcMain.handle('focus:start', (_e, draft: FocusSessionStartDraft) =>
    startFocusSession(draft)
  )
  ipcMain.handle(
    'focus:complete',
    (_e, id: string, patch: FocusSessionCompletePatch) => completeFocusSession(id, patch)
  )
  ipcMain.handle('focus:recent', (_e, limit: number, taskId?: string | null) =>
    listRecentSessions(limit, taskId ?? null)
  )

  ipcMain.handle('trail:record', (_e, draft: ActivityRecordDraft) => recordActivity(draft))
  ipcMain.handle(
    'trail:recent',
    (_e, taskId: string | null, sinceMs: number, limit: number) =>
      getRecentActivity({ taskId, sinceMs, limit })
  )
  ipcMain.handle(
    'trail:summarize',
    (_e, taskId: string | null, sinceMs: number) => summarizeRecentTrail(taskId, sinceMs)
  )

  ipcMain.handle('model:get', () => getModelMode())
  ipcMain.handle('model:set', (_e, mode: ModelMode) => setModelMode(mode))

  ipcMain.handle(
    'bodyDouble:tick',
    (_e, taskId: string | null, recentMessages: string[]) =>
      generatePresenceNarration(taskId, recentMessages)
  )

  ipcMain.handle('smartStack:propose', (_e, taskId: string) => proposeSmartStacks(taskId))

  ipcMain.handle('connectedApps:list', () => listConnectedApps())
  ipcMain.handle('connectedApps:create', (_e, draft: ConnectedAppDraft) =>
    createConnectedApp(draft)
  )
  ipcMain.handle(
    'connectedApps:update',
    (_e, id: string, patch: ConnectedAppPatch) => updateConnectedApp(id, patch)
  )
  ipcMain.handle('connectedApps:delete', (_e, id: string) => deleteConnectedApp(id))
  ipcMain.handle('connectedApps:reorder', (_e, ids: string[]) =>
    reorderConnectedApps(ids)
  )
  ipcMain.handle('connectedApps:touch', (_e, id: string) => touchConnectedApp(id))
  ipcMain.handle('connectedApps:findByHostname', (_e, hostname: string) =>
    findConnectedAppByHostname(hostname)
  )

  // ── Local app launcher ─────────────────────────────────────────────────────
  // Surfaces native-app management to the renderer. Only the picker can open a
  // file dialog (main-process only); the rest can be called from anywhere.
  ipcMain.handle('localApp:pick', () => pickLocalApp())
  ipcMain.handle('localApp:describe', (_e, appPath: string) =>
    describeLocalApp(appPath)
  )
  ipcMain.handle(
    'localApp:launch',
    (_e, input: { appPath: string | null; bundleId: string | null }) =>
      launchLocalApp(input)
  )
  ipcMain.handle(
    'localApp:isRunning',
    (_e, input: { appPath: string | null; title: string }) =>
      isLocalAppRunning(input)
  )
  ipcMain.handle('localApp:refreshIcon', (_e, appPath: string) =>
    refreshAppIcon(appPath)
  )

  // ── Dashboard layouts (Phase 6) ───────────────────────────────────────────
  ipcMain.handle('dashboard:getLayout', (_e, key: string) => getDashboardLayout(key))
  ipcMain.handle(
    'dashboard:setLayout',
    (_e, key: string, cardIds: DashboardCardKind[]) => setDashboardLayout(key, cardIds)
  )
  ipcMain.handle('dashboard:resetLayout', (_e, key: string) =>
    deleteDashboardLayout(key)
  )

  // ── Vault (Phase 7) ───────────────────────────────────────────────────────
  ipcMain.handle('vault:meta', () => getVaultMeta())
  ipcMain.handle('vault:isUnlocked', () => isUnlocked())
  ipcMain.handle('vault:create', (_e, master: string) => createVault(master))
  ipcMain.handle('vault:unlock', (_e, master: string) => unlockVault(master))
  ipcMain.handle('vault:lock', () => {
    lockVault()
  })
  ipcMain.handle('vault:listEntries', () => listEntries())
  ipcMain.handle('vault:createEntry', (_e, draft: VaultEntryDraft) =>
    createEntry(draft)
  )
  ipcMain.handle(
    'vault:updateEntry',
    (_e, id: string, patch: VaultEntryPatch) => updateEntry(id, patch)
  )
  ipcMain.handle('vault:deleteEntry', (_e, id: string) => deleteEntry(id))
  ipcMain.handle('vault:encrypt', (_e, plaintext: string) => encryptWithMaster(plaintext))
  ipcMain.handle('vault:decrypt', (_e, iv: string, ciphertext: string) =>
    decryptWithMaster(iv, ciphertext)
  )

  // ── Energy log ────────────────────────────────────────────────────────────
  ipcMain.handle('energy:log', (_e, level: EnergyLevel) => logEnergy(level))
  ipcMain.handle('energy:current', () => currentEnergy())
  ipcMain.handle('energy:recent', (_e, hours: number) => recentEnergy(hours))

  // ── Mac haptics ───────────────────────────────────────────────────────────
  ipcMain.handle('haptics:available', () => isHapticsAvailable())
  ipcMain.handle('haptics:fire', (_e, feel: HapticFeel) => fireHaptic(feel))

  // ── Files (uploads, attachments, previews) ────────────────────────────────
  ipcMain.handle('files:ingestPath', (_e, sourcePath: string) =>
    ingestFromPath(sourcePath)
  )
  ipcMain.handle(
    'files:ingestBuffer',
    (
      _e,
      input: { buffer: ArrayBuffer; originalName: string; mimeType: string }
    ) =>
      ingestFromBuffer({
        buffer: new Uint8Array(input.buffer),
        originalName: input.originalName,
        mimeType: input.mimeType
      })
  )
  ipcMain.handle('files:get', (_e, id: string) => getFile(id))
  ipcMain.handle('files:delete', (_e, id: string) => deleteFile(id))
  ipcMain.handle('files:read', (_e, id: string) => {
    const r = readFileBytes(id)
    if (!r) return null
    // Buffer → ArrayBuffer for the IPC bridge so the renderer can wrap in a Blob.
    return {
      mimeType: r.mimeType,
      buffer: r.bytes.buffer.slice(
        r.bytes.byteOffset,
        r.bytes.byteOffset + r.bytes.byteLength
      )
    }
  })

  // ── Tables (Notion/Airtable-style databases) ──────────────────────────────
  ipcMain.handle('tables:list', () => listTables())
  ipcMain.handle('tables:get', (_e, id: string) => getTable(id))
  ipcMain.handle('tables:create', (_e, draft: FbTableDraft) => createTable(draft))
  ipcMain.handle('tables:update', (_e, id: string, patch: FbTablePatch) =>
    updateTable(id, patch)
  )
  ipcMain.handle('tables:delete', (_e, id: string) => deleteTable(id))
  ipcMain.handle('tables:listRows', (_e, tableId: string) => listRows(tableId))
  ipcMain.handle('tables:createRow', (_e, draft: FbRowDraft) => createRow(draft))
  ipcMain.handle('tables:updateRow', (_e, id: string, patch: FbRowPatch) =>
    updateRow(id, patch)
  )
  ipcMain.handle('tables:deleteRow', (_e, id: string) => deleteRow(id))
  ipcMain.handle('tables:reorderRows', (_e, tableId: string, ids: string[]) =>
    reorderRows(tableId, ids)
  )
}
