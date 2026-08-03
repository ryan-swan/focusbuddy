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

// Hosts and path shapes that indicate an OAuth / SSO flow. These MUST stay as
// real native popups: the provider posts its callback back through
// `window.opener`, which only exists for an allowed window, so routing them to a
// canvas widget would break sign-in.
const AUTH_HOSTS = [
  /(^|\.)accounts\.google\.com$/i,
  /(^|\.)login\.microsoftonline\.com$/i,
  /(^|\.)login\.live\.com$/i,
  /(^|\.)appleid\.apple\.com$/i,
  /(^|\.)auth0\.com$/i,
  /(^|\.)okta\.com$/i,
  /(^|\.)onelogin\.com$/i,
  /(^|\.)pingidentity\.com$/i,
  /(^|\.)duosecurity\.com$/i,
  /(^|\.)login\.yahoo\.com$/i
]
const AUTH_PATH = /\/(oauth2?|authorize|signin|sign_in|sso|saml|openid)(\/|$|\?|#)/i

function isAuthUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (AUTH_HOSTS.some((re) => re.test(u.hostname))) return true
    return AUTH_PATH.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * Decide what to do with a window.open / link-click from a <webview>.
 *
 * Policy, resolving two competing needs:
 *  - A plain "open in a new tab" — a target=_blank link or window.open(url) as a
 *    foreground/background tab, with a known web URL, no window features, and no
 *    auth signature — becomes a **canvas widget on the desk** (deny + forward).
 *    That URL still opens (on the desk, with a clear Esc path back to the
 *    canvas), so the "menu silently does nothing" fear does not apply: the
 *    content lands as a desk object instead of a separate window that strands
 *    the user off the canvas.
 *  - OAuth / SSO popups, explicit new windows, scripted feature popups, named
 *    windows, and blank handles (window.open('') then navigate) keep a **real
 *    native window** sharing the parent session, because the opener uses the
 *    returned handle / window.opener and denying it would break sign-in.
 *
 * Non-navigable schemes (javascript:, data:, mailto:, blob:) are always denied.
 * Pure decision logic — no side effects, no IPC.
 */
export function decidePopup(
  details: PopupDetails,
  ctx: PopupRouterContext
): PopupDecision {
  const { url, disposition, features, frameName } = details
  const isHttp = !!url && /^https?:\/\//i.test(url)
  const hasFeatures = !!(features && features.length > 0)
  const namedFrame = !!(frameName && frameName !== '_blank' && frameName !== '')

  const isPlainNewTab =
    (disposition === 'foreground-tab' || disposition === 'background-tab') && !hasFeatures && !namedFrame
  if (isHttp && isPlainNewTab && !isAuthUrl(url)) {
    // Open it as a browser object on the desk instead of a stranded window.
    return { action: 'deny', forwardToRenderer: { url } }
  }

  const wantsNewSurface =
    disposition === 'new-window' ||
    disposition === 'foreground-tab' ||
    disposition === 'background-tab' ||
    hasFeatures ||
    namedFrame

  if (wantsNewSurface && isHttp) {
    // A scripted popup (window.open with features, or an explicit new-window)
    // keeps a compact size; a full new surface gets a content window so a
    // doc/app opening into it isn't crammed into a tiny popup.
    const compact = disposition === 'new-window' || hasFeatures
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
