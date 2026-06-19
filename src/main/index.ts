import { app, BrowserWindow, Menu, MenuItem, protocol, session, shell, net } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { config as loadEnv } from 'dotenv'
import { closeDb, getDb } from './db/database'
import { autoBackupOnLaunch } from './db/backup'
import { registerIpcHandlers } from './ipc'
import { decidePopup } from './popupRouter'
import { cleanWebviewUserAgent } from './userAgent'
import { getFile } from './db/files'
import { installFocusTracker } from './streamdeckActions'
import { installActivityTracker } from './activityTracker'
import { registerHaptyxAuthProtocol } from './authProtocol'
import { installAutoUpdater } from './autoUpdate'

loadEnv({ path: join(app.getAppPath(), '.env') })
loadEnv({ path: join(app.getAppPath(), '..', '.env') })

// Test-isolation hook: when running under Playwright we want a throwaway
// userData (separate DB, separate cookies) so tests don't touch the developer's
// real FocusBuddy data. Must be set BEFORE app.whenReady() so getPath('userData')
// picks up the override on first access.
if (process.env.FB_TEST_USER_DATA) {
  app.setPath('userData', process.env.FB_TEST_USER_DATA)
} else if (app.isPackaged) {
  // Data-safe rename: the app was renamed Haptyx → PlexiDesk, which would
  // otherwise move userData from "…/Application Support/Haptyx" to "…/PlexiDesk"
  // and orphan every existing user's database, vault and settings. So if the
  // legacy Haptyx data directory exists, keep using it in place (no copy, no
  // move — zero risk). Fresh installs (no legacy dir) use the default PlexiDesk
  // directory. Cross-platform: getPath('appData') is the per-user app-data root
  // on macOS and Windows alike. Must run BEFORE app.whenReady()/getDb().
  try {
    const legacyUserData = join(app.getPath('appData'), 'Haptyx')
    if (existsSync(legacyUserData)) {
      app.setPath('userData', legacyUserData)
    }
  } catch {
    // If anything goes wrong, fall through to the default path rather than crash.
  }
}

// Register `fb-file://` as a privileged custom protocol so renderers can use it
// in <img>, <video>, <audio>, <iframe>, and CSS background-image. Must happen
// BEFORE app.whenReady() per Electron's protocol-registration rules.
//
// Behaviour: `fb-file://<file-id>` resolves to the on-disk path of the file
// stored under userData/files/. We deliberately don't expose the absolute path
// to the renderer — the protocol is the single source of truth so we can swap
// storage later without touching consumers.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fb-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true, // enables range requests for videos / PDFs
      bypassCSP: true
    }
  },
  // `fb-dev://` is a development-only protocol that serves files from the
  // project's `Mock Videos/` directory (and could serve other mock assets
  // later). It's registered unconditionally — same privilege set as
  // fb-file so video streaming works — but the protocol.handle() below is
  // only wired in dev. In a packaged build the scheme exists but never
  // resolves, so production behaviour is safe.
  {
    scheme: 'fb-dev',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

const isDev = !app.isPackaged

// ── Permission hardening ──────────────────────────────────────────────────
// By default Electron AUTO-GRANTS every permission a page requests. Because we
// embed arbitrary third-party websites in <webview> browser widgets, that means
// any loaded page could silently obtain geolocation, WebHID / WebSerial /
// WebUSB device access, MIDI-sysex, etc. We install a denylist for the
// genuinely dangerous device/location permissions while leaving the ones the
// app actually uses (media for voice/video notes, notifications, clipboard,
// fullscreen) granted. Applied to the default session (main renderer) AND to
// every <webview> session in web-contents-created below.
const DENIED_PERMISSIONS = new Set<string>([
  'geolocation',
  'hid',
  'serial',
  'usb',
  'midiSysex',
  'idle-detection',
  'speaker-selection'
])

function applyPermissionPolicy(ses: Electron.Session): void {
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!DENIED_PERMISSIONS.has(permission))
  })
  ses.setPermissionCheckHandler((_wc, permission) => !DENIED_PERMISSIONS.has(permission))
}

// Register haptyx:// before whenReady so the OS knows we own the
// protocol scheme. Also handles second-instance / open-url events for
// the web→desktop auth handoff. See authProtocol.ts.
registerHaptyxAuthProtocol()

function createCommandCenter(): BrowserWindow {
  // The window stays opaque. Live-mirror widgets render desktopCapturer
  // screenshots in the canvas (cheap, no recording indicator at rest); the
  // user clicks "expand" to push the real native window to the foreground for
  // interactivity. Both modes — screenshot and expanded — are simpler and
  // more reliable than the mix-blend-mode punch-through approach we tried
  // first, which couldn't escape the canvas's CSS-transform stacking context.
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: 'PlexiDesk',
    backgroundColor: '#fbf7ee',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Centre the macOS traffic lights vertically within the 40px (h-10) header
    // and inset them from the left, so they align with the header controls and
    // the renderer can reserve a matching left gap (see isMac padding in App).
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // The app shell never navigates its own top frame. If a dropped tab/link or
  // an errant click tries to navigate the host window to another origin (the
  // classic "drop a URL and it replaces your whole app" failure), block it and
  // open it in the user's browser instead. Webview widgets are separate
  // webContents and are unaffected by this guard.
  win.webContents.on('will-navigate', (e, url) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(url).origin === new URL(win.webContents.getURL()).origin
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' })
    })
    // Mirror the renderer's [voice] trace to the main-process stdout (dev only)
    // so `npm run dev > log` captures the whole voice flow without anyone
    // needing to open DevTools. Temporary diagnostic.
    win.webContents.on('console-message', (_e, _level, message) => {
      if (typeof message === 'string' && message.includes('[voice]')) {
        // eslint-disable-next-line no-console
        console.log('[renderer]', message)
      }
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.on('web-contents-created', (_, contents) => {
  // Only attach to <webview> tag contents — not the main window's React renderer
  if (contents.getType() !== 'webview') return

  // ── User-Agent + permissions ────────────────────────────────────────────
  // Present each browser widget as plain desktop Chrome (strip the Electron +
  // app-name tokens) so OAuth providers stop rejecting the embedded UA with
  // `disallowed_useragent`. Set on the webview's SESSION so popup windows that
  // share the session (see popupRouter) inherit the clean UA too. Also install
  // the permission denylist on this session so embedded sites can't grab
  // geolocation / WebHID / WebSerial / WebUSB. See userAgent.ts.
  try {
    const ses = contents.session
    ses.setUserAgent(cleanWebviewUserAgent(ses.getUserAgent()))
    applyPermissionPolicy(ses)
  } catch {
    // session unavailable on a torn-down contents — best effort
  }

  // ── Popup / OAuth handling ──────────────────────────────────────────────
  // OAuth providers (Google, GitHub, Microsoft, etc.) post their callback back
  // to `window.opener.postMessage` from the popup. If we deny the popup or open
  // it in a context that doesn't share the webview's session, the callback
  // either never fires or fails the cookie check.
  //
  // The fix: allow popups as real native windows AND tell Electron to use the
  // SAME session as the parent webview (so cookies/auth state are shared).
  // For plain target=_blank link clicks (disposition='foreground-tab' or
  // 'background-tab'), we deny here and forward the URL to the renderer so it
  // can spawn a new canvas widget — keeping the click-link-as-widget UX while
  // letting OAuth popups go native.
  contents.setWindowOpenHandler((details) => {
    const decision = decidePopup(details, {
      session: contents.session,
      parentWindow: BrowserWindow.getFocusedWindow() ?? undefined
    })
    if (decision.action === 'allow') {
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: decision.overrideBrowserWindowOptions
      }
    }
    if (decision.forwardToRenderer) {
      const mainWin = BrowserWindow.getAllWindows()[0]
      mainWin?.webContents.send('webview:link-clicked', {
        sourceWebContentsId: contents.id,
        url: decision.forwardToRenderer.url
      })
    }
    return { action: 'deny' }
  })

  contents.on('context-menu', (_event, params) => {
    // Editable fields keep a NATIVE menu so spellcheck suggestions, undo/redo,
    // cut/copy/paste, select-all, and password-manager autofill all behave as
    // the user expects inside the embedded browser. Replacing these with our own
    // menu would silently break them, which the design forbids.
    if (params.isEditable) {
      const menu = new Menu()
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menu.append(new MenuItem({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) }))
      }
      if (params.dictionarySuggestions.length > 0) menu.append(new MenuItem({ type: 'separator' }))
      if (params.misspelledWord) {
        menu.append(
          new MenuItem({
            label: 'Add to dictionary',
            click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          })
        )
        menu.append(new MenuItem({ type: 'separator' }))
      }
      menu.append(new MenuItem({ role: 'undo' }))
      menu.append(new MenuItem({ role: 'redo' }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ role: 'cut' }))
      menu.append(new MenuItem({ role: 'copy' }))
      menu.append(new MenuItem({ role: 'paste' }))
      menu.append(new MenuItem({ role: 'selectAll' }))
      menu.popup()
      return
    }

    // Non-editable content: suppress the native menu and hand off to the
    // renderer's unified Haptyx menu, which classifies the target (text / image
    // / link / video / empty) and offers the same sections as everywhere else.
    const mainWin = BrowserWindow.getAllWindows()[0]
    mainWin?.webContents.send('webview:context-menu', {
      webContentsId: contents.id,
      x: params.x,
      y: params.y,
      selectionText: params.selectionText || undefined,
      linkURL: params.linkURL || undefined,
      srcURL: params.srcURL || undefined,
      mediaType: params.mediaType
    })
  })
})

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('agency.saasmouth.focusbuddy')
  }
  getDb()
  // Rotating safety-net snapshot of the database, at most once per 12h. Runs
  // async, never blocks boot, and is the recovery path if the live DB is later
  // lost or corrupted.
  autoBackupOnLaunch()
  // Harden the main renderer's session too (voice/video-note media stays
  // granted; dangerous device/location permissions are denied).
  applyPermissionPolicy(session.defaultSession)
  registerIpcHandlers()
  // Stream Deck focus handoff — caches the previously-frontmost app so
  // ⌘C / ⌘V / ⌘⇧4 / type-text land in the user's actual workspace
  // rather than in FocusBuddy itself.
  installFocusTracker()
  // Activity tracker — polls frontmost app while FocusBuddy is open so
  // the AI macro suggestor can later analyse repetitive workflows and
  // propose macros. Off by default; the user opts in from the Stream
  // Deck widget.
  installActivityTracker()
  // Auto-updater — polls GitHub Releases on boot + every 4h, broadcasts
  // state via the `update:state` IPC event. No-op in dev builds.
  installAutoUpdater()

  // Wire `fb-file://<id>` → file on disk. Uses Electron's modern `protocol.handle`
  // which supports Range requests transparently (critical for streaming
  // video/audio playback and chunked PDF rendering).
  protocol.handle('fb-file', async (request) => {
    try {
      const url = new URL(request.url)
      // host is the file id (e.g. fb-file://abc-123/) — Chromium normalises
      // to lowercase, but our UUIDs are lowercase anyway. The path is ignored.
      const id = url.hostname
      const file = getFile(id)
      if (!file || !existsSync(file.storedPath)) {
        return new Response('Not found', { status: 404 })
      }
      // net.fetch on a file:// URL streams the file and sets Content-Type
      // based on the extension. We override the mime header to our stored
      // value so the renderer always picks the right viewer.
      const fileUrl = pathToFileURL(file.storedPath).toString()
      const response = await net.fetch(fileUrl)
      const headers = new Headers(response.headers)
      headers.set('Content-Type', file.mimeType)
      headers.set('Cache-Control', 'no-cache')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (err) {
      return new Response(`fb-file error: ${String(err)}`, { status: 500 })
    }
  })

  // Dev-only mock asset protocol — serves files from the project's
  // `Mock Videos/` directory so the body double dialog can use a stand-in
  // video while WebRTC is being built. Only registered when running from
  // a Vite dev server (process.env.ELECTRON_RENDERER_URL is the signal
  // electron-vite uses). In a packaged build this handler isn't installed
  // and fb-dev:// URLs fail gracefully.
  if (process.env.ELECTRON_RENDERER_URL) {
    // app.getAppPath() in dev typically returns the project root because
    // electron-vite runs from there — but log it once on registration so
    // when a fb-dev:// request fails we have the resolved root for
    // diagnosis. (The renderer's silent <video> error is otherwise opaque.)
    // eslint-disable-next-line no-console
    console.log('[fb-dev] registering protocol; appPath =', app.getAppPath())
    protocol.handle('fb-dev', async (request) => {
      try {
        const url = new URL(request.url)
        const subdir = url.hostname
        const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
        const allowedSubdirs: Record<string, string> = {
          'mock-videos': 'Mock Videos'
        }
        const mappedSubdir = allowedSubdirs[subdir]
        if (!mappedSubdir) {
          // eslint-disable-next-line no-console
          console.warn('[fb-dev] forbidden subdir:', subdir)
          return new Response('Forbidden', { status: 403 })
        }
        const root = app.getAppPath()
        const onDisk = `${root}/${mappedSubdir}/${relPath}`
        // Sanity check before handing off — net.fetch's 404 page wraps the
        // real cause in a long HTML body that's hard to spot in the log.
        if (!existsSync(onDisk)) {
          // eslint-disable-next-line no-console
          console.warn('[fb-dev] file does not exist on disk:', onDisk)
          return new Response('Not found', { status: 404 })
        }
        const response = await net.fetch(pathToFileURL(onDisk).toString())
        const headers = new Headers(response.headers)
        if (relPath.endsWith('.mp4')) headers.set('Content-Type', 'video/mp4')
        else if (relPath.endsWith('.webm')) headers.set('Content-Type', 'video/webm')
        headers.set('Cache-Control', 'no-cache')
        // Helpful one-line dev log so we see "the file IS being served"
        // when the user reports the video isn't loading. If this line
        // doesn't print but the <video> shows the fallback, the issue is
        // CSP / element wiring, not the protocol.
        // eslint-disable-next-line no-console
        console.log('[fb-dev] served', request.url, '→', onDisk)
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[fb-dev] handler threw:', err)
        return new Response(`fb-dev error: ${String(err)}`, { status: 500 })
      }
    })
  }

  createCommandCenter()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createCommandCenter()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDb()
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDb()
})
