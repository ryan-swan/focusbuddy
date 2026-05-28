import { ipcMain } from 'electron'
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
  suggestSetupWidgets,
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
  ipcMain.handle(
    'widgetLinks:create',
    (_e, sourceWidgetId: string, targetWidgetId: string, taskId: string) =>
      createLink(sourceWidgetId, targetWidgetId, taskId)
  )
  ipcMain.handle('widgetLinks:delete', (_e, id: string) => deleteLink(id))

  ipcMain.handle('templates:list', () => listTemplates())
  ipcMain.handle(
    'templates:createFromTask',
    (_e, taskId: string, name: string, description?: string) =>
      createTemplateFromTask(taskId, name, description)
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
