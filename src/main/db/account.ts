import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Account session persistence — main-process only.
//
// We keep two facts on disk:
//   1. The session token issued by the signal server's /accounts/login (or
//      /accounts/signup). Encrypted at rest via Electron's safeStorage
//      (macOS Keychain / Windows DPAPI / GNOME keyring). The renderer
//      never sees the encryption key; main encrypts on save, decrypts
//      on load, and hands the plain token to the renderer over IPC.
//   2. A "skippedAt" timestamp the user gets when they dismiss the launch
//      modal with "Continue without account". We use this to avoid
//      re-prompting them every launch — but we DO re-prompt once a week
//      so people who eventually want an account don't have to hunt for
//      the option in Settings.
//
// The renderer never touches the file directly — IPC is the contract.

interface AccountState {
  // Base64-encoded encrypted session token. Null when no session exists.
  encryptedToken: string | null
  // Wall-clock ms when the user last clicked "Continue without account".
  // Used by the renderer to decide whether to show the launch modal.
  skippedAt: number | null
  // Cached email for the "Welcome back, you@example.com" UX. Plaintext —
  // safe to surface unauthenticated. Used as the default value in the
  // login field after a sign-out so the user only re-types their password.
  cachedEmail: string | null
}

const EMPTY: AccountState = {
  encryptedToken: null,
  skippedAt: null,
  cachedEmail: null
}

function fileFor(): string {
  return join(app.getPath('userData'), 'account-session.json')
}

function read(): AccountState {
  const path = fileFor()
  if (!existsSync(path)) return { ...EMPTY }
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AccountState>
    return {
      encryptedToken: parsed.encryptedToken ?? null,
      skippedAt: parsed.skippedAt ?? null,
      cachedEmail: parsed.cachedEmail ?? null
    }
  } catch {
    return { ...EMPTY }
  }
}

function write(state: AccountState): void {
  const path = fileFor()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8')
}

// ── Public API (called from IPC handlers) ───────────────────────────────

export interface PublicAccountState {
  // Plain session token (decrypted). Null if there's none, or if
  // decryption failed (e.g. user migrated machines).
  sessionToken: string | null
  skippedAt: number | null
  cachedEmail: string | null
}

export function loadAccountState(): PublicAccountState {
  const state = read()
  let sessionToken: string | null = null
  if (state.encryptedToken) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buf = Buffer.from(state.encryptedToken, 'base64')
        sessionToken = safeStorage.decryptString(buf)
      } else {
        // Encryption unavailable on this platform — fall back to the
        // raw value (which we'd have stored plain anyway in that case).
        // safeStorage availability is checked at save time, so this
        // branch only fires if the OS keyring went away between sessions.
        sessionToken = state.encryptedToken
      }
    } catch {
      sessionToken = null
    }
  }
  return {
    sessionToken,
    skippedAt: state.skippedAt,
    cachedEmail: state.cachedEmail
  }
}

export function saveSession(token: string, email: string | null): void {
  const cur = read()
  let encryptedToken: string
  if (safeStorage.isEncryptionAvailable()) {
    encryptedToken = safeStorage.encryptString(token).toString('base64')
  } else {
    // No encryption available — store raw. The file lives in userData
    // which has OS-level permissions; not as good as keychain but the
    // best we can do on this platform.
    encryptedToken = token
  }
  write({
    encryptedToken,
    // Saving a session implicitly clears the skip flag — the user is
    // now actively engaged with their account.
    skippedAt: null,
    cachedEmail: email ?? cur.cachedEmail
  })
}

export function clearSession(): void {
  const cur = read()
  write({
    encryptedToken: null,
    skippedAt: cur.skippedAt,
    cachedEmail: cur.cachedEmail
  })
}

// Record that the user dismissed the launch modal. The renderer uses
// `skippedAt` to throttle re-prompts to about once a week.
export function setSkipped(skipped: boolean): void {
  const cur = read()
  write({
    encryptedToken: cur.encryptedToken,
    skippedAt: skipped ? Date.now() : null,
    cachedEmail: cur.cachedEmail
  })
}

// Update the cached email — called after a successful login/signup so
// the next launch's login field can be pre-filled.
export function setCachedEmail(email: string | null): void {
  const cur = read()
  write({
    encryptedToken: cur.encryptedToken,
    skippedAt: cur.skippedAt,
    cachedEmail: email
  })
}
