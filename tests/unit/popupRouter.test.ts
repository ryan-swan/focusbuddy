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

  describe('plain target=_blank links', () => {
    it('denies the popup and forwards the URL to the renderer', () => {
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

    it('ignores empty / unframed link clicks (no widget spawn)', () => {
      const result = decidePopup(
        {
          url: 'https://x.example',
          frameName: '',
          features: '',
          disposition: 'background-tab'
        },
        ctx
      )
      expect(result.action).toBe('deny')
    })

    it('rejects non-http URLs to avoid spawning widgets for javascript: or data:', () => {
      const result = decidePopup(
        {
          url: 'javascript:alert(1)',
          frameName: '_blank',
          features: '',
          disposition: 'foreground-tab'
        },
        ctx
      )
      expect(result.action).toBe('deny')
      if (result.action !== 'deny') return
      expect(result.forwardToRenderer).toBeUndefined()
    })
  })

  describe('regression guards', () => {
    it('does NOT treat foreground-tab as a popup (was the original OAuth-killing bug)', () => {
      // Before the fix, target=_blank links were being routed through the
      // renderer's new-window interceptor which killed window.opener.
      const result = decidePopup(
        {
          url: 'https://provider.example/oauth',
          frameName: '_blank',
          features: '',
          disposition: 'foreground-tab'
        },
        ctx
      )
      // Must NOT be 'allow' — that would skip the renderer widget spawn and
      // open the link as a real popup, which is the wrong UX for a click.
      expect(result.action).toBe('deny')
    })

    it('does NOT route OAuth popups through the renderer (preserves window.opener)', () => {
      const result = decidePopup(
        {
          url: 'https://provider.example/oauth',
          frameName: '',
          features: 'popup=true,width=500,height=600',
          disposition: 'new-window'
        },
        ctx
      )
      // Must be 'allow' — anything else means window.opener gets nulled and
      // OAuth postMessage callback fails.
      expect(result.action).toBe('allow')
    })
  })
})
