import type { BrowserWindowConstructorOptions } from 'electron'

// Inputs and outputs are scoped to the fields we actually inspect — keeps the
// router pure so the unit + e2e suites can call it directly without spinning up
// a real <webview>.
export interface PopupDetails {
  url: string
  frameName: string
  features: string
  disposition: string
}

export type PopupDecision =
  | {
      action: 'allow'
      overrideBrowserWindowOptions: BrowserWindowConstructorOptions
    }
  | {
      action: 'deny'
      // Set when we want the renderer to spawn a canvas widget for the URL
      // instead of opening a real popup window. Pure record — no side effects
      // here, the caller wires this up to IPC.
      forwardToRenderer?: { url: string }
    }

export interface PopupRouterContext {
  // Forwarded to overrideBrowserWindowOptions.webPreferences.session so the
  // popup shares the parent webview's cookies + auth state.
  session: Electron.Session
  // Optional parent window for proper z-order + focus-restore on close.
  parentWindow?: Electron.BrowserWindow
}

/**
 * Decide what to do with a window.open / link-click from a <webview>:
 *  - True popups (window.open with features, or disposition='new-window')
 *    → allow as native windows sharing the parent session.
 *  - Plain target=_blank link clicks → deny, forward URL to renderer so the
 *    renderer spawns a canvas widget.
 *
 * Pure decision logic — no side effects, no IPC. The caller wires the
 * forwarding into the renderer.
 */
export function decidePopup(
  details: PopupDetails,
  ctx: PopupRouterContext
): PopupDecision {
  const { url, disposition, features, frameName } = details
  const isPopup =
    disposition === 'new-window' ||
    (features && features.length > 0) ||
    (frameName && frameName !== '_blank' && frameName !== '')

  if (isPopup) {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 720,
        minWidth: 360,
        minHeight: 480,
        autoHideMenuBar: true,
        parent: ctx.parentWindow,
        webPreferences: {
          session: ctx.session,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false
        }
      }
    }
  }

  if (url && /^https?:\/\//i.test(url)) {
    return { action: 'deny', forwardToRenderer: { url } }
  }
  return { action: 'deny' }
}
