import { app, ipcMain, BrowserWindow, dialog, shell, webContents as allWebContents, type WebContents } from 'electron'
import { writeFile } from 'node:fs/promises'
import { consumePendingAuthHandoff } from '../authProtocol'
import {
  checkForUpdates,
  getCurrentUpdateState,
  installUpdateAndRestart,
  openDownloadPage,
  downloadAndInstallMacUpdate
} from '../autoUpdate'
import {
  clearSecret,
  encryptionAvailable,
  hint,
  resolveAnthropicKey,
  resolveOpenAIKey,
  setSecret,
  setAiMode,
  type AiMode
} from '../settingsStore'
import { invalidateAnthropicClient } from '../ai/anthropic'
import { getAiStatus, refreshCredits, startTopUp } from '../ai/creditMode'
import * as mailAccount from '../mail/mailAccount'
import type { MailAccountConfig } from '../mail/mailAccount'
import {
  testConnection as testMailConnection,
  listInbox,
  getMessage,
  markSeen,
  resetConnection as resetMailConnection
} from '../mail/imap'
import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument
} from '../db/documents'
import { searchAll } from '../db/search'
import { generateDocument } from '../ai/anthropic'
import type { DocType, DocumentDraft, DocumentPatch, MailSendInput } from '@shared/types'
import { sendMail } from '../mail/smtp'
import { suggestReply, resetToneCache } from '../mail/aiReply'
import Anthropic from '@anthropic-ai/sdk'
import {
  createNode,
  deleteNode,
  restoreNodes,
  getNode,
  listNodes,
  moveNode,
  updateNode
} from '../db/nodes'
import {
  bringToFront,
  createWidget,
  deleteWidget,
  restoreWidget,
  getWidget,
  listWidgetsByTask,
  updateWidget
} from '../db/widgets'
import { collectTelemetry, recordAiCall } from '../db/telemetry'
import { getLaunchInfo } from '../launchVersion'
import {
  createLink,
  deleteLink,
  listLinksByTask,
  updateLink,
  type WireUpdate
} from '../db/widgetLinks'
import {
  branchSnapshot,
  createSnapshot,
  getSnapshot,
  listSnapshots,
  restoreSnapshot
} from '../db/canvasSnapshots'
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
  readFileBytes,
  listEntries as listFileEntries,
  getEntry as getFileEntry,
  folderPath as fileFolderPath,
  createFolder as createFileFolder,
  renameEntry as renameFileEntry,
  moveEntry as moveFileEntry,
  deleteEntry as deleteFileEntry,
  restoreEntries as restoreFileEntries,
  fileDocument,
  unfiledDocuments
} from '../db/files'
import {
  openExternalUrl,
  openLocalFile,
  pickAndIngestFile,
  pickFilesIntoFolder,
  revealFile,
  thumbnailForFile
} from '../filePreviews'
import {
  extractActionsFromTranscript,
  processTranscript,
  transcribeAudio,
  type ProcessMode,
  type TranscriptionProvider
} from '../ai/voiceNote'
import { preloadLocalWhisper } from '../ai/localWhisper'
import {
  runVoiceCommand,
  runVoiceCommandStreaming,
  type CanvasSnapshotWidget,
  type VoiceCommandInput
} from '../ai/voiceCommand'
import { getVoiceCommandPrefs, setVoiceCommandPrefs } from '../voiceCommandPref'
import {
  importFile,
  pickFileForImport,
  pickGridFileForImport,
  type ImportTargetKind
} from '../fileImport'
import {
  expandMindMapNode,
  listAvailableAgents,
  suggestAgentsForNode,
  type MindMapNodeKind,
  type LocalAgent
} from '../ai/mindMap'
import {
  createAgent,
  type AgentModelTier,
  type AgentTool
} from '../ai/agentBuilder'
import { shell as electronShell } from 'electron'
import {
  getWorkspaceOverride,
  setWorkspaceOverride
} from '../workspacePref'
import { invokeAgent } from '../ai/agentDispatcher'
import {
  listInvocationsForNode,
  recordOutcome,
  statsForSlug,
  undoLastApply
} from '../ai/agentHistory'
import {
  getTranscriptionProvider,
  setTranscriptionProvider
} from '../voiceProviderPref'
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
import {
  createTimeBlock,
  deleteTimeBlock,
  listBlocksInRange,
  updateTimeBlock
} from '../db/timeBlocks'
import { fireHaptic, isHapticsAvailable, type HapticFeel } from '../haptics'
import {
  backupInfo,
  createBackup,
  defaultExportName,
  restoreFromFile,
  validateBackupFile
} from '../db/backup'
import {
  changeMasterPassword,
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
  designAgentProfile,
  regenerateLivingPage,
  runDeskAgent,
  runTransformWire,
  sendChat,
  routeCommandBar,
  transformText,
  suggestWidgetSetup,
  suggestPageContent,
  suggestSetupWidgets,
  suggestTableRows,
  summarizeRecentTrail,
  suggestDocContent,
  rewriteSelection,
  suggestSheetColumns,
  fillSheetRange,
  generateSlideElements
} from '../ai/anthropic'
import { importDocx, exportDocx, exportPdf, pickImage } from '../officeDocx'
import { importSheet, exportSheet } from '../sheetIo'
import { exportSlides, importPptx } from '../slidesIo'
import { getModelMode, setModelMode } from '../ai/modelRouting'
import { describeWidgetForAgent } from '../ai/agentInputs'
import type {
  ActivityRecordDraft,
  ChatRequest,
  ConnectedAppDraft,
  ConnectedAppPatch,
  DashboardCardKind,
  EnergyLevel,
  TimeBlockDraft,
  TimeBlockPatch,
  FocusSessionCompletePatch,
  FocusSessionStartDraft,
  ModelMode,
  NodeDraft,
  NodePatch,
  VaultEntryDraft,
  VaultEntryPatch,
  WidgetDraft,
  WidgetPatch,
  WireType
} from '@shared/types'

// A plain-language description of the content format a wired output widget
// expects, so a desk agent can produce the right shape for each one.
function outputFormatHint(w: { kind: string; content: string | null }): string {
  switch (w.kind) {
    case 'markdown':
      return 'Markdown'
    case 'page':
      return 'a document written in Markdown (headings, bullet lists, paragraphs)'
    case 'sticky':
    case 'note':
      return 'plain text'
    case 'card':
      return 'a short title on the first line, then the body'
    case 'table':
      return 'a list of items, one per line (the app turns them into typed table rows)'
    case 'mindmap':
      return 'an outline: the first line is the root, then one item per line'
    case 'field': {
      try {
        const t = (JSON.parse(w.content || '{}') as { def?: { type?: string } }).def?.type
        if (t === 'number') return 'a single number'
        if (t === 'date') return 'a date'
        if (t === 'checkbox') return 'yes or no'
        if (t === 'single-select' || t === 'multi-select') return 'one of the field’s options'
      } catch {
        /* fall through */
      }
      return 'a short single value'
    }
    default:
      return 'plain text'
  }
}

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
  ipcMain.handle('nodes:restore', (_e, ids: string[]) => restoreNodes(ids))
  ipcMain.handle(
    'nodes:move',
    (_e, id: string, newParentId: string | null, beforeId: string | null) =>
      moveNode(id, newParentId, beforeId)
  )

  ipcMain.handle('widgets:listByTask', (_e, taskId: string) => listWidgetsByTask(taskId))
  ipcMain.handle('widgets:create', (_e, draft: WidgetDraft) => createWidget(draft))
  ipcMain.handle('widgets:update', (_e, id: string, patch: WidgetPatch) => updateWidget(id, patch))
  ipcMain.handle('widgets:delete', (_e, id: string) => deleteWidget(id))
  ipcMain.handle('widgets:restore', (_e, id: string) => restoreWidget(id))
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
  // Electron.app; in production it's PlexiDesk.app.
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
    (_e, sourceWidgetId: string, targetWidgetId: string, taskId: string, type?: WireType) =>
      createLink(sourceWidgetId, targetWidgetId, taskId, type ?? 'context')
  )
  ipcMain.handle('widgetLinks:update', (_e, id: string, patch: WireUpdate) =>
    updateLink(id, patch)
  )
  ipcMain.handle('widgetLinks:delete', (_e, id: string) => deleteLink(id))

  // Desk time-travel snapshots.
  ipcMain.handle('snapshots:create', (_e, taskId: string, label?: string) =>
    createSnapshot(taskId, listWidgetsByTask(taskId), label ?? '')
  )
  ipcMain.handle('snapshots:list', (_e, taskId: string) => listSnapshots(taskId))
  ipcMain.handle('snapshots:get', (_e, id: string) => getSnapshot(id))
  ipcMain.handle('snapshots:restore', (_e, id: string) => restoreSnapshot(id))
  ipcMain.handle('snapshots:branch', (_e, id: string, title: string) => branchSnapshot(id, title))

  // Live wires: run a transform wire. Reads the source + target content in
  // main (avoids shipping large documents over IPC twice) and returns the
  // plain-text result for the renderer to write into the target.
  ipcMain.handle(
    'wires:runTransform',
    async (_e, sourceId: string, targetId: string, verb: string, liveText?: string) => {
      const source = getWidget(sourceId)
      const target = getWidget(targetId)
      if (!source || !target) {
        return { ok: false, error: 'A wired widget no longer exists.' }
      }
      // Resolve the source to real content (an agent feeds its output; a browser
      // contributes its LIVE page text if supplied, else a server-side fetch).
      const described = await describeWidgetForAgent(source, liveText)
      return runTransformWire({
        sourceContent: described.content,
        verb,
        targetCurrentContent: target.content ?? ''
      })
    }
  )

  // Desk agents: gather the agent's wired inputs (widgets wired INTO it) in
  // main and run the standing instruction over them. Returns plain-text output
  // for the renderer to log on the agent widget. An agent wired in contributes
  // its latest OUTPUT as the input (so agents can pipeline into each other).
  ipcMain.handle(
    'agents:run',
    async (
      _e,
      agentId: string,
      taskId: string,
      instruction: string,
      liveInputs?: Record<string, string>,
      persona?: string,
      browserWcId?: number
    ) => {
      const links = listLinksByTask(taskId)
      const inputWidgets = links
        .filter((l) => l.targetWidgetId === agentId)
        .map((l) => getWidget(l.sourceWidgetId))
        .filter((w): w is NonNullable<ReturnType<typeof getWidget>> => !!w && !w.archived)
      // Resolve each input to real, readable content. A browser uses its LIVE
      // rendered text when the renderer supplied it (so logged-in pages work),
      // else a server-side fetch; a table becomes its rows, etc.
      const inputs = await Promise.all(
        inputWidgets.map((w) => describeWidgetForAgent(w, liveInputs?.[w.id]))
      )
      // Where this agent's output is auto-delivered + the FORMAT each target
      // expects, so the agent produces the right shape and doesn't ask the user
      // for "access" to write the linked page/note/table/field.
      const outputs = links
        .filter((l) => l.sourceWidgetId === agentId)
        .map((l) => getWidget(l.targetWidgetId))
        .filter((w): w is NonNullable<ReturnType<typeof getWidget>> => !!w && !w.archived)
        .map((w) => ({ kind: w.kind, title: w.title ?? '', format: outputFormatHint(w) }))
      return runDeskAgent({ instruction, inputs, persona, browserWcId, outputs })
    }
  )

  ipcMain.handle('agents:designProfile', (_e, description: string) =>
    designAgentProfile(description)
  )

  // Dev metrics — per-process RAM + CPU for the whole Electron app, so the perf
  // overlay can show exactly what each browser process costs.
  ipcMain.handle('metrics:get', () => {
    return app.getAppMetrics().map((m) => ({
      pid: m.pid,
      // 'Browser' is the main process; 'Tab' is a renderer (the main window AND
      // each <webview>); plus GPU / Utility / etc.
      type: m.type,
      name: m.name ?? '',
      cpu: Math.round((m.cpu?.percentCPUUsage ?? 0) * 10) / 10,
      // workingSetSize is in KB → MB.
      memMB: Math.round((m.memory?.workingSetSize ?? 0) / 1024)
    }))
  })

  // Map every live webContents to the OS process it runs in, so the overlay can
  // label each renderer ('Tab') row with the widget that owns it. app.getAppMetrics
  // gives RAM/CPU keyed by OS pid; webContents.getOSProcessId() is the bridge.
  // The renderer joins osPid → process row, and webContentsId → widget via the
  // webview registry. type 'window' is the app's own UI window.
  ipcMain.handle('metrics:webContents', () => {
    return allWebContents.getAllWebContents().map((wc) => {
      let osPid = 0
      let title = ''
      let url = ''
      try {
        osPid = wc.getOSProcessId()
      } catch {
        /* process gone */
      }
      try {
        title = wc.getTitle()
      } catch {
        /* destroyed */
      }
      try {
        url = wc.getURL()
      } catch {
        /* destroyed */
      }
      return { webContentsId: wc.id, osPid, type: wc.getType(), title, url }
    })
  })

  // Inspect what a widget contributes when wired into an agent — for a portal,
  // its aggregated desk(s). Powers tests + a future "preview feed" affordance.
  ipcMain.handle('agents:previewInput', async (_e, widgetId: string) => {
    const w = getWidget(widgetId)
    if (!w) return { content: '' }
    const d = await describeWidgetForAgent(w)
    return { kind: d.kind, content: d.content }
  })

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

  ipcMain.handle('chat:send', (_e, req: ChatRequest) => {
    recordAiCall()
    return sendChat(req)
  })
  ipcMain.handle('chat:hasApiKey', () => Boolean(resolveAnthropicKey()))
  ipcMain.handle('chat:proactiveWelcome', (_e, taskId: string) =>
    generateProactiveWelcome(taskId)
  )
  ipcMain.handle('resume:generate', (_e, taskId: string) => {
    recordAiCall()
    return generateResume(taskId)
  })
  ipcMain.handle('setup:suggest', (_e, taskId: string) => {
    recordAiCall()
    return suggestSetupWidgets(taskId)
  })
  ipcMain.handle(
    'setup:buildFromPrompt',
    (_e, input: { prompt: string; taskId: string | null }) => {
      recordAiCall()
      return buildFromPrompt(input)
    }
  )
  ipcMain.handle('livingPage:regenerate', (_e, widgetId: string) => {
    recordAiCall()
    return regenerateLivingPage(widgetId)
  })
  ipcMain.handle('ai:suggestPageContent', (_e, prompt: string) => {
    recordAiCall()
    return suggestPageContent(prompt)
  })
  ipcMain.handle('ai:routeCommand', (_e, input: { system: string; text: string }) => {
    recordAiCall()
    return routeCommandBar(input)
  })
  // In-editor document AI: formatted insert + selection rewrite.
  ipcMain.handle('ai:suggestDocContent', (_e, input: { prompt: string }) => {
    recordAiCall()
    return suggestDocContent(input)
  })
  ipcMain.handle('ai:rewriteSelection', (_e, input: { text: string; instruction: string }) => {
    recordAiCall()
    return rewriteSelection(input)
  })

  // ── Office interop for the document editor (.docx / PDF / image) ───────────
  ipcMain.handle('office:importDocx', () => importDocx())
  ipcMain.handle('office:exportDocx', (_e, input: { html: string; title: string }) => exportDocx(input))
  ipcMain.handle('office:exportPdf', (_e, input: { html: string; title: string }) => exportPdf(input))
  ipcMain.handle('office:pickImage', () => pickImage())

  // ── Spreadsheet interop + AI fill ─────────────────────────────────────────
  ipcMain.handle('sheet:import', () => importSheet())
  ipcMain.handle('sheet:export', (_e, input: Parameters<typeof exportSheet>[0]) => exportSheet(input))
  ipcMain.handle('ai:suggestSheetColumns', (_e, input: { prompt: string; existing?: string[] }) => {
    recordAiCall()
    return suggestSheetColumns(input)
  })
  ipcMain.handle('ai:fillSheetRange', (_e, input: { prompt: string; headers: string[]; rangeRows: number }) => {
    recordAiCall()
    return fillSheetRange(input)
  })

  // ── Slides interop + AI ───────────────────────────────────────────────────
  ipcMain.handle('slides:export', (_e, input: Parameters<typeof exportSlides>[0]) => exportSlides(input))
  ipcMain.handle('slides:import', () => importPptx())
  ipcMain.handle('documents:generateSlides', (_e, input: { mode: 'deck' | 'append' | 'redesign'; prompt: string }) => {
    recordAiCall()
    return generateSlideElements(input)
  })

  // ── AI source: PlexiDesk credits vs bring-your-own-key ────────────────────
  // Status snapshot for the settings panel + out-of-credits prompts.
  ipcMain.handle('ai:getStatus', () => getAiStatus())
  // Switch source; invalidate the cached client so the next call honours it.
  ipcMain.handle('ai:setMode', (_e, mode: AiMode) => {
    setAiMode(mode)
    invalidateAnthropicClient()
    return getAiStatus()
  })
  // Pull the live balance from the signal server (lazily grants the trial).
  ipcMain.handle('ai:refreshCredits', () => refreshCredits())
  // Begin a Stripe checkout for a credit top-up and open it in the browser.
  ipcMain.handle('ai:topUpCredits', async (_e, amountUsd: number) => {
    const result = await startTopUp(amountUsd)
    if (result.ok && result.url) {
      await shell.openExternal(result.url)
    }
    return result
  })
  // Telemetry snapshot for the renderer to report to the signal server.
  ipcMain.handle('telemetry:collect', () => collectTelemetry())
  ipcMain.handle(
    'ai:transformText',
    (_e, input: { text: string; instruction: string; kind?: string }) => {
      recordAiCall()
      return transformText(input)
    }
  )
  ipcMain.handle(
    'ai:suggestWidgetSetup',
    (_e, input: { widgetId: string; prompt?: string }) => {
      recordAiCall()
      return suggestWidgetSetup(input)
    }
  )
  ipcMain.handle(
    'ai:suggestTableRows',
    (_e, tableId: string, prompt: string, count: number) => {
      recordAiCall()
      return suggestTableRows(tableId, prompt, count)
    }
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
  ipcMain.handle(
    'vault:changeMasterPassword',
    (_e, currentPassword: string, newPassword: string) =>
      changeMasterPassword(currentPassword, newPassword)
  )
  ipcMain.handle('vault:encrypt', (_e, plaintext: string) => encryptWithMaster(plaintext))
  ipcMain.handle('vault:decrypt', (_e, iv: string, ciphertext: string) =>
    decryptWithMaster(iv, ciphertext)
  )

  // ── Energy log ────────────────────────────────────────────────────────────
  ipcMain.handle('energy:log', (_e, level: EnergyLevel) => logEnergy(level))
  ipcMain.handle('energy:current', () => currentEnergy())
  ipcMain.handle('energy:recent', (_e, hours: number) => recentEnergy(hours))

  // ── Calendar time blocks ────────────────────────────────────────────────
  ipcMain.handle('timeblocks:list', (_e, fromMs: number, toMs: number) =>
    listBlocksInRange(fromMs, toMs)
  )
  ipcMain.handle('timeblocks:create', (_e, draft: TimeBlockDraft) => createTimeBlock(draft))
  ipcMain.handle('timeblocks:update', (_e, id: string, patch: TimeBlockPatch) =>
    updateTimeBlock(id, patch)
  )
  ipcMain.handle('timeblocks:delete', (_e, id: string) => deleteTimeBlock(id))

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
      input: { buffer: ArrayBuffer; originalName: string; mimeType: string; parentId?: string | null }
    ) =>
      ingestFromBuffer({
        buffer: new Uint8Array(input.buffer),
        originalName: input.originalName,
        mimeType: input.mimeType,
        parentId: input.parentId ?? null
      })
  )
  ipcMain.handle('files:get', (_e, id: string) => getFile(id))
  ipcMain.handle('files:delete', (_e, id: string) => deleteFile(id))

  // Document export — the markdown widget (and any rich-text surface) hands us
  // a fully self-contained, styled HTML string. We save it as a standalone
  // .html file, or render it in a hidden window and printToPDF for a clean PDF,
  // writing either through the native save dialog so the user picks the spot.
  // ── Workspace backup / export / restore ─────────────────────────────────
  // A backup is one consistent SQLite snapshot. Export writes it where the user
  // chooses; restore validates a chosen file, snapshots current data for safety,
  // swaps it in, and reports back so the renderer can reload onto the new data.
  ipcMain.handle('backup:info', () => backupInfo())
  ipcMain.handle('backup:export', async () => {
    const parent = BrowserWindow.getFocusedWindow()
    const opts = {
      title: 'Export a FocusBuddy backup',
      defaultPath: defaultExportName(),
      filters: [{ name: 'FocusBuddy backup', extensions: ['fbbackup'] }]
    }
    const { canceled, filePath } = parent
      ? await dialog.showSaveDialog(parent, opts)
      : await dialog.showSaveDialog(opts)
    if (canceled || !filePath) return { ok: false as const, canceled: true as const }
    try {
      await createBackup(filePath)
      return { ok: true as const, path: filePath }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })
  ipcMain.handle('backup:restore', async () => {
    const parent = BrowserWindow.getFocusedWindow()
    const open = parent
      ? await dialog.showOpenDialog(parent, {
          title: 'Restore from a FocusBuddy backup',
          properties: ['openFile'],
          filters: [{ name: 'FocusBuddy backup', extensions: ['fbbackup', 'db'] }]
        })
      : await dialog.showOpenDialog({
          title: 'Restore from a FocusBuddy backup',
          properties: ['openFile'],
          filters: [{ name: 'FocusBuddy backup', extensions: ['fbbackup', 'db'] }]
        })
    if (open.canceled || open.filePaths.length === 0) {
      return { ok: false as const, canceled: true as const }
    }
    const src = open.filePaths[0]
    const valid = validateBackupFile(src)
    if (!valid.ok) return { ok: false as const, error: valid.error }

    // Destructive: replacing all current data. Confirm explicitly first.
    const confirmOpts = {
      type: 'warning' as const,
      buttons: ['Cancel', 'Replace my data'],
      defaultId: 0,
      cancelId: 0,
      title: 'Restore from backup',
      message: 'Replace all your current data with this backup?',
      detail:
        'Your current data will be snapshotted first (you can recover it from the backups folder), then replaced. FocusBuddy will reload when done.'
    }
    const { response } = parent
      ? await dialog.showMessageBox(parent, confirmOpts)
      : await dialog.showMessageBox(confirmOpts)
    if (response !== 1) return { ok: false as const, canceled: true as const }

    const result = await restoreFromFile(src)
    if (!result.ok) return { ok: false as const, error: result.error }
    return { ok: true as const, safetyBackupPath: result.safetyBackupPath }
  })
  ipcMain.handle('backup:revealFolder', () => {
    electronShell.openPath(backupInfo().dir)
    return { ok: true as const }
  })

  ipcMain.handle(
    'export:html',
    async (_e, input: { html: string; suggestedName: string }) => {
      const name = input.suggestedName.replace(/\.html?$/i, '') || 'note'
      const parent = BrowserWindow.getFocusedWindow()
      const opts = { defaultPath: `${name}.html`, filters: [{ name: 'HTML', extensions: ['html'] }] }
      const { canceled, filePath } = parent
        ? await dialog.showSaveDialog(parent, opts)
        : await dialog.showSaveDialog(opts)
      if (canceled || !filePath) return { ok: false as const }
      await writeFile(filePath, input.html, 'utf8')
      return { ok: true as const, path: filePath }
    }
  )
  ipcMain.handle(
    'export:pdf',
    async (_e, input: { html: string; suggestedName: string }) => {
      const name = input.suggestedName.replace(/\.pdf$/i, '') || 'note'
      const parent = BrowserWindow.getFocusedWindow()
      const opts = { defaultPath: `${name}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
      const { canceled, filePath } = parent
        ? await dialog.showSaveDialog(parent, opts)
        : await dialog.showSaveDialog(opts)
      if (canceled || !filePath) return { ok: false as const }
      const render = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      try {
        await render.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(input.html))
        const pdf = await render.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' }
        })
        await writeFile(filePath, pdf)
      } finally {
        render.destroy()
      }
      return { ok: true as const, path: filePath }
    }
  )
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
  // pickAndIngest: opens the native file picker AND copies the chosen file
  // into userData/files in one round-trip. Returns the new FbFile or null
  // if the user cancelled.
  ipcMain.handle(
    'files:pickAndIngest',
    (_e, opts?: { title?: string; defaultPath?: string }) =>
      pickAndIngestFile(opts ?? {})
  )
  // QuickLook-backed thumbnail for any ingested file. Cached on disk by file
  // id + size, regenerated only on cache miss.
  ipcMain.handle(
    'files:thumbnail',
    (_e, id: string, opts?: { size?: number }) =>
      thumbnailForFile(id, opts ?? {})
  )
  // Open a locally ingested file in the user's default app (Preview, Word,
  // VS Code, etc. — whatever Finder would open). Returns { ok } discriminated
  // result so the renderer can surface error toasts.
  ipcMain.handle('files:open', (_e, id: string) => openLocalFile(id))
  // Open a remote URL in the user's default browser. Allowed only for
  // http: / https: — other protocols return { ok: false, error }.
  ipcMain.handle('files:openExternal', (_e, url: string) => openExternalUrl(url))

  // ── File / folder manager ─────────────────────────────────────────────────
  // fb_files doubles as a foldered library: folders, imported external files,
  // and references to internal documents. Handlers are thin wrappers over the
  // db/files manager functions plus OS-level pick/reveal in filePreviews.
  ipcMain.handle('fileManager:list', (_e, parentId: string | null) => listFileEntries(parentId))
  ipcMain.handle('fileManager:get', (_e, id: string) => getFileEntry(id))
  ipcMain.handle('fileManager:path', (_e, id: string | null) => fileFolderPath(id))
  ipcMain.handle('fileManager:createFolder', (_e, parentId: string | null, name: string) =>
    createFileFolder(parentId, name)
  )
  ipcMain.handle('fileManager:rename', (_e, id: string, name: string) => renameFileEntry(id, name))
  ipcMain.handle('fileManager:move', (_e, id: string, newParentId: string | null) => moveFileEntry(id, newParentId))
  ipcMain.handle('fileManager:delete', (_e, id: string) => deleteFileEntry(id))
  ipcMain.handle('fileManager:restore', (_e, ids: string[]) => restoreFileEntries(ids))
  ipcMain.handle('fileManager:fileDocument', (_e, docId: string, parentId: string | null) =>
    fileDocument(docId, parentId)
  )
  ipcMain.handle('fileManager:unfiledDocuments', () => unfiledDocuments())
  ipcMain.handle('fileManager:pickFiles', (_e, parentId: string | null) => pickFilesIntoFolder(parentId))
  ipcMain.handle('fileManager:reveal', (_e, id: string) => revealFile(id))

  // ── Voice / video note AI pipeline ────────────────────────────────────────
  // Three independently-invokable stages so the renderer can:
  //   1. Record → transcribe (calls Whisper)
  //   2. Choose Full / Cleaned / Summary → render the chosen text
  //   3. (optional) Run action extraction → preview proposals → apply
  // Each returns a tagged-union result so the renderer can branch on
  // result.ok without unwrapping exceptions.
  ipcMain.handle(
    'ai:transcribeAudio',
    (
      _e,
      input: {
        buffer?: ArrayBuffer
        mimeType?: string
        samples?: ArrayBuffer | Float32Array
        sampleRate?: number
      }
    ) => {
      // Float32Array travels via structured-clone over IPC and tends to
      // arrive intact, but defensively normalise from ArrayBuffer as
      // well (in case a serializer flattens the typed-array tag).
      let samples: Float32Array | undefined
      if (input.samples instanceof Float32Array) {
        samples = input.samples
      } else if (input.samples instanceof ArrayBuffer) {
        samples = new Float32Array(input.samples)
      }
      return transcribeAudio({
        bytes: input.buffer ? new Uint8Array(input.buffer) : undefined,
        mimeType: input.mimeType,
        samples,
        sampleRate: input.sampleRate
      })
    }
  )
  ipcMain.handle(
    'ai:processTranscript',
    (_e, input: { transcript: string; mode: ProcessMode }) =>
      processTranscript(input.transcript, input.mode)
  )
  ipcMain.handle(
    'ai:extractActionsFromTranscript',
    (_e, input: { transcript: string }) =>
      extractActionsFromTranscript(input.transcript)
  )

  // Transcription provider preference — read + write the persisted
  // choice between 'cloud' (OpenAI Whisper) and 'local' (Transformers.js).
  // Flipping to 'local' immediately fires a preload so the user doesn't
  // wait ~30s on their first recording.
  // ── Mind-mapper AI pipeline ───────────────────────────────────────────────
  // Three handlers backing the mind-map widget:
  //   - mindmap:expand        — Claude generates 3-5 child branches
  //   - mindmap:listAgents    — read .claude/agents/*.md
  //   - mindmap:suggestAgents — Claude picks 1-3 best matches per node
  ipcMain.handle(
    'mindmap:expand',
    (
      _e,
      input: {
        rootPath: string[]
        nodeLabel: string
        nodeKind?: MindMapNodeKind
        guidance?: string
      }
    ) => expandMindMapNode(input)
  )

  // workspaceResolver handles the path probing in one centralised
  // place (settings override → cwd walk → known operator paths →
  // userData fallback). Returns the inventory PLUS metadata so the
  // renderer can show "Agents from: <path>" and offer Open-in-Finder.
  ipcMain.handle('mindmap:listAgents', () => listAvailableAgents())

  // Workspace path override + Open-in-Finder. Exposed under the
  // `agents:` namespace because the resolver primarily serves the
  // agent system, but the resolved path is useful for any other
  // tool that wants to read from .claude/.
  ipcMain.handle('agents:getWorkspaceOverride', () => getWorkspaceOverride())
  ipcMain.handle(
    'agents:setWorkspaceOverride',
    (_e, path: string) => {
      setWorkspaceOverride(path)
      return { ok: true }
    }
  )
  ipcMain.handle('agents:revealInFinder', (_e, path: string) => {
    try {
      electronShell.showItemInFolder(path)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'mindmap:suggestAgents',
    (
      _e,
      input: {
        rootPath: string[]
        nodeLabel: string
        nodeKind?: MindMapNodeKind
        candidates: LocalAgent[]
      }
    ) => suggestAgentsForNode(input)
  )

  // Phase 2A — Agent creation. Generates the body via Claude Sonnet
  // and writes a new .md file to <workspace>/.claude/agents/.
  ipcMain.handle(
    'agents:create',
    (
      _e,
      input: {
        slug: string
        description: string
        model: AgentModelTier
        tools: AgentTool[]
        purpose: string
        contextPath?: string[]
      }
    ) => createAgent(input)
  )

  // Phase 2C foundation — single-turn agent invocation. Returns
  // ActionProposal[] for the renderer to review-and-apply via the
  // existing chat-side flow. NOT autonomous; user is always in the
  // loop. See agentDispatcher.ts for the PHASE_3 markers.
  ipcMain.handle(
    'agents:invoke',
    (
      _e,
      input: {
        agentPath: string
        rootPath: string[]
        nodeLabel: string
        nodeKind: string
        userMessage: string
        conversationHistory?: Array<{ role: 'user' | 'agent'; content: string }>
        conversationKey?: string
        nodeId?: string | null
      }
    ) => invokeAgent(input)
  )

  // Phase 2 polish — outcome recording + per-agent stats + undo.
  ipcMain.handle(
    'agents:recordOutcome',
    (
      _e,
      input: {
        invocationId: string
        agentSlug: string
        proposalId: string
        proposalKind: string
        action: 'applied' | 'dismissed' | 'undone'
        createdEntityRef?: string | null
      }
    ) => {
      recordOutcome(input)
      return { ok: true }
    }
  )
  ipcMain.handle(
    'agents:listInvocationsForNode',
    (_e, nodeId: string) => listInvocationsForNode(nodeId)
  )
  ipcMain.handle(
    'agents:statsForSlug',
    (_e, slug: string) => statsForSlug(slug)
  )
  ipcMain.handle('agents:undoLast', () => undoLastApply())

  ipcMain.handle('voice:getProvider', () => getTranscriptionProvider())
  ipcMain.handle('voice:setProvider', async (_e, p: TranscriptionProvider) => {
    setTranscriptionProvider(p)
    if (p === 'local') {
      const result = await preloadLocalWhisper()
      return { ok: result.ok, error: result.error }
    }
    return { ok: true }
  })

  // Voice command — floating mic interpreter. Sonnet receives the
  // transcript + a pruned canvas snapshot and returns ActionProposals.
  ipcMain.handle(
    'voiceCommand:run',
    (
      _e,
      input: {
        transcript: string
        activeTaskId: string | null
        selectedWidgetId: string | null
        widgets: CanvasSnapshotWidget[]
      }
    ) => runVoiceCommand(input as VoiceCommandInput)
  )
  ipcMain.handle('voiceCommand:getPrefs', () => getVoiceCommandPrefs())
  ipcMain.handle(
    'voiceCommand:setPrefs',
    (_e, patch: Parameters<typeof setVoiceCommandPrefs>[0]) =>
      setVoiceCommandPrefs(patch)
  )
  // File import — system file picker, plus a content-aware converter
  // that turns .txt/.md/.csv/.json into widget drafts.
  ipcMain.handle('fileImport:pick', () => pickFileForImport())
  ipcMain.handle(
    'fileImport:run',
    (_e, args: { path: string; preferredTextKind?: ImportTargetKind }) =>
      importFile(args.path, args.preferredTextKind ?? 'page')
  )
  // Table import wizard — pick a tabular file and read it into a normalised
  // { headers, rows } grid the renderer maps onto an existing table.
  ipcMain.handle('fileImport:pickGrid', () => pickGridFileForImport())
  ipcMain.handle('fileImport:parseGrid', async (_e, path: string) => {
    const { parseGridFromFile } = await import('../gridImport')
    return parseGridFromFile(path)
  })

  // Streaming variant — proposals + reply text arrive on a per-request
  // channel `voiceCommand:stream:<reqId>` so the renderer can correlate
  // multiple in-flight invocations. Caller mints the reqId; we just
  // shovel events at it. The handler returns synchronously once the
  // stream completes (success OR error) so the renderer's await
  // resolves cleanly.
  ipcMain.handle(
    'voiceCommand:runStream',
    async (
      e,
      input: VoiceCommandInput & { requestId: string }
    ): Promise<{ ok: boolean }> => {
      const channel = `voiceCommand:stream:${input.requestId}`
      const sender = e.sender
      const send = (type: string, payload?: unknown): void => {
        if (sender.isDestroyed()) return
        sender.send(channel, { type, payload })
      }
      await runVoiceCommandStreaming(
        {
          transcript: input.transcript,
          activeTaskId: input.activeTaskId,
          selectedWidgetId: input.selectedWidgetId,
          widgets: input.widgets
        },
        {
          onReply: (text) => send('reply', text),
          onProposal: (p) => send('proposal', p),
          onError: (err) => send('error', err),
          onComplete: (sum) => send('complete', sum)
        }
      )
      return { ok: true }
    }
  )

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

  // ── haptyx:// deep-link auth handoff ─────────────────────────────────────
  // The renderer calls `auth:get-pending` on mount to drain any token that
  // arrived before the window was ready (cold-start case where the user
  // clicked the brochure "Open in Haptyx" button while the app wasn't
  // running). Subsequent tokens arrive via the `auth:incoming-token`
  // event broadcast from authProtocol.ts.
  ipcMain.handle('auth:get-pending', () => consumePendingAuthHandoff())

  // ── Auto-update ──────────────────────────────────────────────────────────
  // The renderer subscribes via the `update:state` event (broadcast from
  // autoUpdate.ts on every state transition). On mount the renderer
  // can read the current snapshot via `update:get-state` so it picks
  // up whatever state was missed before subscription.
  ipcMain.handle('update:get-state', () => getCurrentUpdateState())
  ipcMain.handle('update:check', () => {
    checkForUpdates()
    return { ok: true }
  })
  ipcMain.handle('update:install-and-restart', () => {
    installUpdateAndRestart()
    return { ok: true }
  })
  ipcMain.handle('update:open-download', () => {
    openDownloadPage()
    return { ok: true }
  })
  ipcMain.handle('update:download-and-install', () => {
    void downloadAndInstallMacUpdate()
    return { ok: true }
  })

  // First-run detection for the "What's new" modal: did this launch follow an
  // update? Authoritative because main persists the last-run version in
  // userData (the renderer can't tell a fresh install from an upgrade).
  ipcMain.handle('app:get-launch-info', () => getLaunchInfo())

  // ── Settings: API-key vault ──────────────────────────────────────────────
  // Replaces the old "edit projects/focusbuddy/.env and restart" flow with
  // an in-app form. Plaintext never crosses the IPC boundary on read —
  // the renderer only sees `{ hasKey, last4 }` so the UI can render a
  // "set" / "•••• abcd" badge. Saving and testing accept plaintext one-way.

  ipcMain.handle('settings:encryptionAvailable', () => encryptionAvailable())

  // Turn a nodemailer/SMTP send failure into a short, human message. The auth
  // case is the common one — Gmail and friends reject a normal password and
  // need an app-specific one, the same as the IMAP side.
  function explainSendError(err: unknown): string {
    const e = (err ?? {}) as { code?: string; responseCode?: number; message?: string }
    const msg = [e.code, e.message].filter(Boolean).join(' ')
    if (e.code === 'EAUTH' || e.responseCode === 535 || /auth|credential|password|535/i.test(msg)) {
      return 'The mail server rejected the login when sending. Gmail, iCloud and Fastmail need an app-specific password, not your normal one.'
    }
    if (e.code === 'EENVELOPE' || /no recipients|envelope/i.test(msg)) {
      return 'The server rejected the recipients. Check the To, Cc and Bcc addresses.'
    }
    if (/ECONNECTION|ETIMEDOUT|ECONNREFUSED|timeout|ESOCKET| EDNS|ENOTFOUND/i.test(msg)) {
      return 'Could not reach the sending server. Check your connection and try again.'
    }
    return e.message || 'Sending failed.'
  }

  // ── Mail (IMAP) ────────────────────────────────────────────────────────
  // The user's own mailbox, connected directly from the desktop. The renderer
  // only ever sees host/port/user (never the password), proposes a config to
  // save+test, and asks for the message list / one full message on demand.
  ipcMain.handle('mail:getAccount', () => mailAccount.getPublic())

  ipcMain.handle('mail:saveAccount', async (_e, config: MailAccountConfig) => {
    try {
      // Verify the credentials before persisting, so a typo never silently
      // saves a broken account.
      const result = await testMailConnection(config)
      if (!result.ok) return result
      mailAccount.save(config)
      // Drop any warm connection so the next fetch reconnects with the
      // just-saved credentials (a password change keeps the same host/user),
      // and forget the learned tone — it was sampled from the old mailbox.
      resetMailConnection()
      resetToneCache()
      return { ok: true as const, account: mailAccount.getPublic() }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:testAccount', async (_e, config: MailAccountConfig) => {
    return testMailConnection(config)
  })

  ipcMain.handle('mail:clearAccount', () => {
    mailAccount.clear()
    // Close the live socket and forget the learned tone — the account they both
    // belonged to is gone.
    resetMailConnection()
    resetToneCache()
    return { ok: true as const }
  })

  ipcMain.handle('mail:list', async (_e, limit?: number) => {
    const config = mailAccount.getFull()
    if (!config) return { ok: false as const, error: 'No mail account connected.' }
    try {
      const items = await listInbox(config, limit ?? 40)
      return { ok: true as const, items }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:get', async (_e, uid: number) => {
    const config = mailAccount.getFull()
    if (!config) return { ok: false as const, error: 'No mail account connected.' }
    try {
      const message = await getMessage(config, uid)
      if (!message) return { ok: false as const, error: 'Message not found.' }
      return { ok: true as const, message }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:markSeen', async (_e, uid: number) => {
    const config = mailAccount.getFull()
    if (!config) return { ok: false as const, error: 'No mail account connected.' }
    try {
      await markSeen(config, uid)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'mail:suggestReply',
    async (_e, incoming: { subject: string; from: string; body: string }) => {
      const config = mailAccount.getFull()
      if (!config) return { ok: false as const, error: 'No mail account connected.' }
      return suggestReply(config, {
        subject: incoming?.subject ?? '',
        from: incoming?.from ?? '',
        body: incoming?.body ?? ''
      })
    }
  )

  ipcMain.handle('mail:send', async (_e, input: MailSendInput) => {
    const config = mailAccount.getFull()
    if (!config) return { ok: false as const, error: 'No mail account connected.' }
    const to = (input.to ?? []).map((a) => a.trim()).filter(Boolean)
    if (to.length === 0) {
      return { ok: false as const, error: 'Add at least one recipient.' }
    }
    try {
      await sendMail(config, {
        to,
        cc: (input.cc ?? []).map((a) => a.trim()).filter(Boolean),
        bcc: (input.bcc ?? []).map((a) => a.trim()).filter(Boolean),
        subject: input.subject ?? '',
        text: input.text ?? '',
        inReplyTo: input.inReplyTo,
        references: input.references
      })
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: explainSendError(err) }
    }
  })

  // ── Global search ───────────────────────────────────────────────────────
  ipcMain.handle('search:query', (_e, q: string) => searchAll(typeof q === 'string' ? q : ''))

  // ── Office documents (doc / sheet / slides) ─────────────────────────────
  ipcMain.handle('documents:list', () => listDocuments())
  ipcMain.handle('documents:get', (_e, id: string) => getDocument(id))
  ipcMain.handle('documents:create', (_e, draft: DocumentDraft) => createDocument(draft))
  ipcMain.handle('documents:update', (_e, id: string, patch: DocumentPatch) =>
    updateDocument(id, patch)
  )
  ipcMain.handle('documents:delete', (_e, id: string) => deleteDocument(id))
  ipcMain.handle(
    'documents:generate',
    (_e, input: { docType: DocType; prompt: string; audience?: string }) =>
      generateDocument(input)
  )

  ipcMain.handle('settings:hintAnthropic', () => hint('anthropic'))
  ipcMain.handle('settings:hintOpenAI', () => hint('openai'))

  ipcMain.handle('settings:saveAnthropicKey', (_e, plaintext: string) => {
    try {
      setSecret('anthropic', plaintext)
      invalidateAnthropicClient()
      return { ok: true, ...hint('anthropic') }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:saveOpenAIKey', (_e, plaintext: string) => {
    try {
      setSecret('openai', plaintext)
      // No client cache to invalidate — Whisper calls construct the
      // fetch directly per request, so the next call picks up the new
      // key automatically.
      return { ok: true, ...hint('openai') }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:clearAnthropicKey', () => {
    try {
      clearSecret('anthropic')
      invalidateAnthropicClient()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:clearOpenAIKey', () => {
    try {
      clearSecret('openai')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Validate the stored key by sending a 1-token "ping" prompt. Costs
  // roughly $0.0001 on Haiku — small enough that a "Test" button click is
  // basically free, and it confirms the key, the model, and the network
  // path all work end-to-end (vs. just checking a list endpoint).
  ipcMain.handle('settings:testAnthropicKey', async () => {
    const key = resolveAnthropicKey()
    if (!key) return { ok: false, error: 'No key set.' }
    try {
      const client = new Anthropic({ apiKey: key })
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      if ((response.stop_reason as string) === 'refusal') {
        return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
      }
      if ((response.stop_reason as string) === 'model_context_window_exceeded') {
        return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
      }
      return { ok: true, model: response.model }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Strip the SDK's verbose response body so the renderer can show a
      // single-line error rather than a wall of JSON.
      const short = msg.length > 240 ? msg.slice(0, 240) + '…' : msg
      return { ok: false, error: short }
    }
  })

  // Validate the OpenAI key by hitting /v1/models (free — no token cost,
  // confirms the key + network + scope all line up before the user runs
  // into it via the Whisper transcription flow). Mirrors the Anthropic
  // test pattern.
  ipcMain.handle('settings:testOpenAIKey', async () => {
    const key = resolveOpenAIKey()
    if (!key) return { ok: false, error: 'No key set.' }
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { authorization: `Bearer ${key}` }
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        const short = txt.length > 240 ? txt.slice(0, 240) + '…' : txt
        return { ok: false, error: `${res.status} ${res.statusText}${short ? ' · ' + short : ''}` }
      }
      const body = (await res.json()) as { data?: Array<{ id: string }> }
      const hasWhisper = (body.data ?? []).some((m) => m.id.startsWith('whisper'))
      return {
        ok: true,
        model: hasWhisper ? 'whisper available' : 'no whisper model in account'
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const short = msg.length > 240 ? msg.slice(0, 240) + '…' : msg
      return { ok: false, error: short }
    }
  })
}
