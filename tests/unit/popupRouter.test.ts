import { describe, it, expect } from 'vitest'
import { decidePopup } from '../../src/main/popupRouter'

// Stand-in for Electron.Session — the router only stores it for re-emission into
// webPreferences, never calls methods on it.
const FAKE_SESSION = { _stub: true } as unknown as Electron.Session

const ctx = { session: FAKE_SESSION }

describe('decidePopup', () => {
  describe('OAuth-style popups', () => {
    it('allows window.open with explicit features as a native popup', () => {
      const result = decidePopup(
        {
          url: 'https://accounts.google.com/o/oauth2/auth?...',
          frameName: '',
          features: 'width=600,height=700,popup=true',
          disposition: 'new-window'
        },
        ctx
      )
      expect(result.action).toBe('allow')
      if (result.action !== 'allow') return
      expect(result.overrideBrowserWindowOptions.width).toBe(520)
      expect(result.overrideBrowserWindowOptions.height).toBe(720)
    })

    it('shares the parent session so cookies + auth state survive', () => {
      const result = decidePopup(
        {
          url: 'https://github.com/login/oauth',
          frameName: '',
          features: 'popup=true',
          disposition: 'new-window'
        },
        ctx
      )
      expect(result.action).toBe('allow')
      if (result.action !== 'allow') return
      expect(result.overrideBrowserWindowOptions.webPreferences?.session).toBe(
        FAKE_SESSION
      )
    })

    it('disables nodeIntegration + webviewTag on the popup (sandboxed)', () => {
      const result = decidePopup(
        {
          url: 'https://login.microsoftonline.com',
          frameName: '',
          features: 'popup=true',
          disposition: 'new-window'
        },
        ctx
      )
      expect(result.action).toBe('allow')
      if (result.action !== 'allow') return
      const prefs = result.overrideBrowserWindowOptions.webPreferences!
      expect(prefs.nodeIntegration).toBe(false)
      expect(prefs.contextIsolation).toBe(true)
      expect(prefs.sandbox).toBe(true)
      expect(prefs.webviewTag).toBe(false)
    })

    it('allows named popups (window.open(url, "popupName")) as native windows', () => {
      // Some OAuth providers use frameName as the window handle for postMessage —
      // a named non-_blank target should be treated as a popup, not a link click.
      const result = decidePopup(
        {
          url: 'https://provider.example/auth',
          frameName: 'oauth_popup',
          features: '',
          disposition: 'new-window'
        },
        ctx
      )
      expect(result.action).toBe('allow')
    })
  })

  describe('new tabs (target=_blank / window.open without features) → desk widget', () => {
    it('forwards a plain foreground-tab to a canvas widget with the URL', () => {
      const result = decidePopup(
        {
          url: 'https://docs.example.com/article',
          frameName: '_blank',
          features: '',
          disposition: 'foreground-tab'
        },
        ctx
      )
      expect(result.action).toBe('deny')
      if (result.action !== 'deny') return
      expect(result.forwardToRenderer?.url).toBe('https://docs.example.com/article')
    })

    it('forwards a background-tab to a canvas widget too', () => {
      const result = decidePopup(
        { url: 'https://x.example', frameName: '', features: '', disposition: 'background-tab' },
        ctx
      )
      expect(result.action).toBe('deny')
      if (result.action !== 'deny') return
      expect(result.forwardToRenderer?.url).toBe('https://x.example')
    })

    it('a "new document" opened as a plain new tab becomes a desk object, not a stranded window', () => {
      // The user's report: clicking "create new doc" opened a separate window
      // with no path back to the desk. A plain new tab to a known URL now lands
      // as a canvas widget instead.
      const result = decidePopup(
        {
          url: 'https://docs.google.com/document/d/abc/edit',
          frameName: '',
          features: '',
          disposition: 'foreground-tab'
        },
        ctx
      )
      expect(result.action).toBe('deny')
      if (result.action !== 'deny') return
      expect(result.forwardToRenderer?.url).toContain('docs.google.com')
    })

    it('denies non-http schemes (javascript:, data:, mailto:) without forwarding', () => {
      for (const url of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.com']) {
        const result = decidePopup(
          { url, frameName: '_blank', features: '', disposition: 'foreground-tab' },
          ctx
        )
        expect(result.action).toBe('deny')
        if (result.action !== 'deny') return
        expect(result.forwardToRenderer).toBeUndefined()
      }
    })
  })

  describe('auth exception — a plain new tab that IS an auth flow stays native', () => {
    it('keeps a foreground-tab to an auth host (accounts.google.com) as a native window', () => {
      const result = decidePopup(
        { url: 'https://accounts.google.com/signin/v2', frameName: '', features: '', disposition: 'foreground-tab' },
        ctx
      )
      expect(result.action).toBe('allow')
    })

    it('keeps a foreground-tab whose path is an oauth/authorize flow native', () => {
      const result = decidePopup(
        { url: 'https://provider.example/oauth2/authorize?client_id=x', frameName: '', features: '', disposition: 'foreground-tab' },
        ctx
      )
      expect(result.action).toBe('allow')
    })
  })

  describe('regression guards', () => {
    it('an explicit new-window still opens as a native window (handle-dependent)', () => {
      const result = decidePopup(
        { url: 'https://app.example/tool', frameName: '', features: '', disposition: 'new-window' },
        ctx
      )
      expect(result.action).toBe('allow')
    })

    it('OAuth popups stay compact and keep the session (preserves window.opener)', () => {
      const result = decidePopup(
        {
          url: 'https://provider.example/oauth',
          frameName: '',
          features: 'popup=true,width=500,height=600',
          disposition: 'new-window'
        },
        ctx
      )
      expect(result.action).toBe('allow')
      if (result.action !== 'allow') return
      expect(result.overrideBrowserWindowOptions.width).toBe(520)
    })
  })
})
