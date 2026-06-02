import { create } from 'zustand'
import {
  getMe,
  login as serverLogin,
  logout as serverLogout,
  signup as serverSignup,
  type AuthResult,
  type ServerAccount
} from '../lib/accountClient'

// Account store — single source of truth for "am I signed in, and as who?"
// on the renderer.
//
// Lifecycle:
//   1. App boots → init() loads the cached session from main (encrypted
//      via safeStorage). If present, validates it against /accounts/me.
//      Valid → account populated. Invalid (network or expired) → cleared.
//   2. User signs up / logs in → store saves session via IPC to main
//      (which encrypts + persists), populates account.
//   3. User signs out → wipes the session from main + local memory + the
//      cached email (their choice — they explicitly left).
//
// The store also tracks `bootStatus` so the launch modal knows when it's
// safe to render — we don't want to flash the sign-in modal for half a
// second before realizing the user is already signed in.

export type BootStatus = 'idle' | 'loading' | 'ready'

interface AccountStore {
  bootStatus: BootStatus
  // The plain session token (decrypted) — used as the Authorization
  // bearer for inbox + future cloud-sync calls. Null when signed out.
  sessionToken: string | null
  account: ServerAccount | null
  // Wall-clock ms when the user last clicked "Continue without account"
  // in the launch modal. Lets the modal throttle re-prompts to ~weekly.
  skippedAt: number | null
  cachedEmail: string | null
  // Loaded once on app boot. Validates the cached session, populates
  // account. Idempotent; safe to call multiple times.
  init: () => Promise<void>
  // Sign up via the server, persist + populate on success.
  signup: (input: {
    email: string
    password: string
    handle?: string | null
  }) => Promise<AuthResult>
  // Log in via the server, persist + populate on success.
  login: (input: { email: string; password: string }) => Promise<AuthResult>
  // Sign out — wipe local + main session, tell the server to invalidate.
  signOut: () => Promise<void>
  // Tell main to remember the user dismissed the launch modal.
  setSkipped: (skipped: boolean) => Promise<void>
  // Adopt a session token handed off from the web flow via the
  // haptyx:// URL scheme. Validates the token against the server,
  // persists it locally if valid, returns the new account. The token
  // is the same shape as `signup`/`login` produce, so this method is
  // just "skip the password step because the web already proved it."
  adoptHandoff: (input: {
    sessionToken: string
    email: string | null
  }) => Promise<AuthResult>
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  bootStatus: 'idle',
  sessionToken: null,
  account: null,
  skippedAt: null,
  cachedEmail: null,

  init: async () => {
    if (get().bootStatus !== 'idle') return
    set({ bootStatus: 'loading' })
    try {
      const cached = await window.api.account.load()
      set({
        skippedAt: cached.skippedAt,
        cachedEmail: cached.cachedEmail
      })
      if (!cached.sessionToken) {
        set({ bootStatus: 'ready' })
        return
      }
      // Validate against the server. If the server says "not authenticated"
      // (token expired or revoked), wipe locally so the next boot is clean.
      const account = await getMe(cached.sessionToken)
      if (!account) {
        await window.api.account.clearSession()
        set({ sessionToken: null, account: null, bootStatus: 'ready' })
        return
      }
      set({
        sessionToken: cached.sessionToken,
        account,
        bootStatus: 'ready'
      })
    } catch (err) {
      // Surface but don't crash — the user can still use the app offline.
      // eslint-disable-next-line no-console
      console.warn('[accountStore.init] failed:', err)
      set({ bootStatus: 'ready' })
    }
  },

  signup: async (input) => {
    const result = await serverSignup(input)
    if (result.ok) {
      await window.api.account.saveSession({
        token: result.sessionToken,
        email: result.account.email
      })
      set({
        sessionToken: result.sessionToken,
        account: result.account,
        skippedAt: null,
        cachedEmail: result.account.email
      })
    }
    return result
  },

  login: async (input) => {
    const result = await serverLogin(input)
    if (result.ok) {
      await window.api.account.saveSession({
        token: result.sessionToken,
        email: result.account.email
      })
      set({
        sessionToken: result.sessionToken,
        account: result.account,
        skippedAt: null,
        cachedEmail: result.account.email
      })
    }
    return result
  },

  signOut: async () => {
    const cur = get().sessionToken
    if (cur) {
      // Fire-and-forget — even if the server is unreachable, we proceed
      // with the local wipe so the user isn't stuck "signed in" locally.
      void serverLogout(cur)
    }
    await window.api.account.clearSession()
    set({ sessionToken: null, account: null })
  },

  setSkipped: async (skipped) => {
    await window.api.account.setSkipped(skipped)
    set({ skippedAt: skipped ? Date.now() : null })
  },

  adoptHandoff: async ({ sessionToken, email }) => {
    // Validate the token by asking the server who it belongs to.
    // If the token is expired/forged the server returns null and we
    // surface a normal failed-auth result so the caller can show the
    // launch modal.
    const account = await getMe(sessionToken)
    if (!account) {
      return {
        ok: false,
        error: 'Sign-in link expired. Sign in again from the website.',
        code: 'INVALID_CREDENTIALS'
      }
    }
    // Mismatched email-hint is non-fatal — the server's account row is
    // authoritative. We log it once for debug.
    if (email && email.toLowerCase() !== account.email.toLowerCase()) {
      // eslint-disable-next-line no-console
      console.warn('[accountStore.adoptHandoff] email hint mismatch', email, account.email)
    }
    await window.api.account.saveSession({ token: sessionToken, email: account.email })
    set({
      sessionToken,
      account,
      skippedAt: null,
      cachedEmail: account.email
    })
    return { ok: true, sessionToken, account }
  }
}))
