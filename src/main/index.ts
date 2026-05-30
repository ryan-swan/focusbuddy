import { app, BrowserWindow, Menu, MenuItem, protocol, shell, net } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { config as loadEnv } from 'dotenv'
import { closeDb, getDb } from './db/database'
import { registerIpcHandlers } from './ipc'
import { decidePopup } from './popupRouter'
import { getFile } from './db/files'
import type { ContextMenuAction } from '@shared/types'

loadEnv({ path: join(app.getAppPath(), '.env') })
loadEnv({ path: join(app.getAppPath(), '..', '.env') })

// Test-isolation hook: when running under Playwright we want a throwaway
// userData (separate DB, separate cookies) so tests don't touch the developer's
// real FocusBuddy data. Must be set BEFORE app.whenReady() so getPath('userData')
// picks up the override on first access.
if (process.env.FB_TEST_USER_DATA) {
  app.setPath('userData', process.env.FB_TEST_USER_DATA)
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
    title: 'FocusBuddy',
    backgroundColor: '#fbf7ee',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' })
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function dispatchContextAction(
  action: ContextMenuAction,
  webContentsId: number,
  params: Electron.ContextMenuParams
): void {
  const mainWin = BrowserWindow.getAllWindows()[0]
  if (!mainWin) return
  mainWin.webContents.send('context-menu:action', {
    action,
    webContentsId,
    x: params.x,
    y: params.y,
    selectionText: params.selectionText || undefined,
    linkURL: params.linkURL || undefined,
    srcURL: params.srcURL || undefined
  })
}

app.on('web-contents-created', (_, contents) => {
  // Only attach to <webview> tag contents — not the main window's React renderer
  if (contents.getType() !== 'webview') return

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
    const menu = new Menu()
    const wcId = contents.id
    let added = 0

    if (params.selectionText && params.selectionText.trim().length > 0) {
      menu.append(
        new MenuItem({
          label: 'Create sticky from selection',
          click: () => dispatchContextAction('createStickyFromSelection', wcId, params)
        })
      )
      menu.append(
        new MenuItem({
          label: 'Create note from selection',
          click: () => dispatchContextAction('createNoteFromSelection', wcId, params)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
      added += 2
    }

    if (params.linkURL) {
      menu.append(
        new MenuItem({
          label: 'Open link in new Browser widget',
          click: () => dispatchContextAction('openLinkInNewBrowser', wcId, params)
        })
      )
      added += 1
    }

    if (params.mediaType === 'image' && params.srcURL) {
      menu.append(
        new MenuItem({
          label: 'Save image to canvas',
          click: () => dispatchContextAction('saveImageToCanvas', wcId, params)
        })
      )
      added += 1
    }

    if (params.mediaType === 'video' && params.srcURL) {
      menu.append(
        new MenuItem({
          label: 'Save video to canvas',
          click: () => dispatchContextAction('saveVideoToCanvas', wcId, params)
        })
      )
      added += 1
    }

    if (added === 0) return // nothing FocusBuddy-relevant; let default behaviour (none) occur

    // System edit items below for usability when text is selected/editable
    if (params.editFlags.canCopy) {
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ role: 'copy' }))
    }
    if (params.editFlags.canPaste) menu.append(new MenuItem({ role: 'paste' }))

    menu.popup()
  })
})

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('agency.saasmouth.focusbuddy')
  }
  getDb()
  registerIpcHandlers()

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
    protocol.handle('fb-dev', async (request) => {
      try {
        const url = new URL(request.url)
        // host = subdir under the project root (e.g. `mock-videos`).
        // pathname is the file relative to that subdir (e.g. `/working-webcam.mp4`).
        const subdir = url.hostname
        const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
        // Whitelist exactly what dev can serve to avoid an accidental
        // filesystem read-anything bug if this handler ever leaks.
        const allowedSubdirs: Record<string, string> = {
          'mock-videos': 'Mock Videos'
        }
        const mappedSubdir = allowedSubdirs[subdir]
        if (!mappedSubdir) {
          return new Response('Forbidden', { status: 403 })
        }
        // app.getAppPath() in dev returns the project root because
        // electron-vite runs from there.
        const root = app.getAppPath()
        const onDisk = `${root}/${mappedSubdir}/${relPath}`
        const response = await net.fetch(pathToFileURL(onDisk).toString())
        const headers = new Headers(response.headers)
        // Map common extensions to mime types so the renderer's <video>
        // element picks the right codec path.
        if (relPath.endsWith('.mp4')) headers.set('Content-Type', 'video/mp4')
        else if (relPath.endsWith('.webm')) headers.set('Content-Type', 'video/webm')
        headers.set('Cache-Control', 'no-cache')
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      } catch (err) {
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
