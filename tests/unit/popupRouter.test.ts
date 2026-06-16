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

  describe('new tabs (target=_blank / window.open without features)', () => {
    it('opens a foreground-tab as a full-content native window (so window.open returns a handle)', () => {
      const result = decidePopup(
        {
          url: 'https://docs.example.com/article',
          frameName: '_blank',
          features: '',
          disposition: 'foreground-tab'
        },
        ctx
      )
      expect(result.action).toBe('allow')
      if (result.action !== 'allow') return
      // Full content window, not the compact popup size.
      expect(result.overrideBrowserWindowOptions.width).toBe(1180)
      expect(result.overrideBrowserWindowOptions.height).toBe(820)
      expect(result.overrideBrowserWindowOptions.webPreferences?.session).toBe(FAKE_SESSION)
    })

    it('opens a background-tab as a native window too', () => {
      const result = decidePopup(
        { url: 'https://x.example', frameName: '', features: '', disposition: 'background-tab' },
        ctx
      )
      expect(result.action).toBe('allow')
    })

    it('denies non-http schemes (javascript:, data:, mailto:)', () => {
      for (const url of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.com']) {
        const result = decidePopup(
          { url, frameName: '_blank', features: '', disposition: 'foreground-tab' },
          ctx
        )
        expect(result.action).toBe('deny')
      }
    })
  })

  describe('regression guards', () => {
    it('a foreground-tab window.open gets a real window handle, not a dead null (the menu-does-nothing bug)', () => {
      // Google Docs "open a file" calls window.open(url) → foreground-tab. If we
      // deny, window.open returns null and the menu silently does nothing. It
      // MUST be allowed so the opener gets a usable handle.
      const result = decidePopup(
        {
          url: 'https://docs.google.com/document/d/abc/edit',
          frameName: '',
          features: '',
          disposition: 'foreground-tab'
        },
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
