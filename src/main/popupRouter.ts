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
 * Decide what to do with a window.open / link-click from a <webview>.
 *
 * Policy: any request for a new window OR a new tab to a real web URL becomes a
 * native window that shares the parent session. Returning 'allow' is what gives
 * the opener a usable window handle. The previous policy denied new tabs (to
 * spawn a canvas widget instead), but denying makes `window.open()` return
 * null, which is exactly why app menus that open a tab — Google Docs "open a
 * file" / "new document", many providers' OAuth — silently did nothing. Real
 * browser behaviour (a new surface with a live handle) is what makes those
 * work, so we favour that over the widget-spawn convenience. Dragging a link
 * onto the canvas to make a widget is a separate, intact flow.
 *
 * Non-navigable schemes (javascript:, data:, mailto:, blob:) are always denied.
 *
 * Pure decision logic — no side effects, no IPC.
 */
export function decidePopup(
  details: PopupDetails,
  ctx: PopupRouterContext
): PopupDecision {
  const { url, disposition, features, frameName } = details
  const isHttp = !!url && /^https?:\/\//i.test(url)

  const wantsNewSurface =
    disposition === 'new-window' ||
    disposition === 'foreground-tab' ||
    disposition === 'background-tab' ||
    (features && features.length > 0) ||
    (frameName && frameName !== '_blank' && frameName !== '')

  if (wantsNewSurface && isHttp) {
    // A scripted popup (window.open with features, or an explicit new-window)
    // keeps a compact size; a plain new tab gets a full content window so a
    // doc/app opening into it isn't crammed into a tiny popup.
    const compact = disposition === 'new-window' || !!(features && features.length > 0)
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: compact ? 520 : 1180,
        height: compact ? 720 : 820,
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

  return { action: 'deny' }
}
