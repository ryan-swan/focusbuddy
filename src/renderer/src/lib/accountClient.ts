import { signalConfig } from './signalConfig'

// Thin REST client for the signal server's accounts + inbox endpoints.
// Lives in the renderer because it's pure fetch — main doesn't need to
// proxy network calls. The session token comes from the account store
// (which loads it from the IPC-backed secure storage on boot).

export interface ServerAccount {
  id: string
  email: string
  handle: string | null
  createdAt: number
  lastLoginAt: number | null
}

export interface InboxItemFromServer {
  id: string
  accountId: string
  shareToken: string
  addedAt: number
  share: {
    token: string
    kind: 'folder' | 'task' | 'widget'
    fromHandle: string
    scope: 'view' | 'copy'
    createdAt: number
    snapshot: unknown
  } | null
}

interface AuthSuccess {
  ok: true
  sessionToken: string
  account: ServerAccount
}

interface AuthFailure {
  ok: false
  error: string
  code: 'EMAIL_EXISTS' | 'INVALID_CREDENTIALS' | 'NETWORK' | 'BAD_INPUT' | 'SERVER'
}

export type AuthResult = AuthSuccess | AuthFailure

function urlFor(path: string): string {
  // Trim trailing slash so we get clean concatenation.
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

async function postJson<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<{ res: Response; json: T | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(urlFor(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  let json: T | null = null
  try {
    json = (await res.json()) as T
  } catch {
    json = null
  }
  return { res, json }
}

async function getJson<T>(path: string, token?: string): Promise<{ res: Response; json: T | null }> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(urlFor(path), { method: 'GET', headers })
  let json: T | null = null
  try {
    json = (await res.json()) as T
  } catch {
    json = null
  }
  return { res, json }
}

// ── Auth ────────────────────────────────────────────────────────────────

export async function signup(input: {
  email: string
  password: string
  handle?: string | null
}): Promise<AuthResult> {
  try {
    const { res, json } = await postJson<{
      ok: boolean
      sessionToken?: string
      account?: ServerAccount
      error?: string
    }>('/accounts/signup', input)
    if (!res.ok || !json) {
      const code: AuthFailure['code'] =
        res.status === 409 ? 'EMAIL_EXISTS' : res.status === 400 ? 'BAD_INPUT' : 'SERVER'
      return {
        ok: false,
        error: json?.error || `Signup failed (${res.status}).`,
        code
      }
    }
    if (!json.sessionToken || !json.account) {
      return {
        ok: false,
        error: 'Server returned an unexpected response.',
        code: 'SERVER'
      }
    }
    return { ok: true, sessionToken: json.sessionToken, account: json.account }
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the server: ${(err as Error).message}`,
      code: 'NETWORK'
    }
  }
}

export async function login(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  try {
    const { res, json } = await postJson<{
      ok: boolean
      sessionToken?: string
      account?: ServerAccount
      error?: string
    }>('/accounts/login', input)
    if (!res.ok || !json) {
      const code: AuthFailure['code'] =
        res.status === 401 ? 'INVALID_CREDENTIALS' : 'SERVER'
      return {
        ok: false,
        error: json?.error || 'Invalid email or password.',
        code
      }
    }
    if (!json.sessionToken || !json.account) {
      return {
        ok: false,
        error: 'Server returned an unexpected response.',
        code: 'SERVER'
      }
    }
    return { ok: true, sessionToken: json.sessionToken, account: json.account }
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the server: ${(err as Error).message}`,
      code: 'NETWORK'
    }
  }
}

export async function logout(token: string): Promise<void> {
  try {
    await postJson('/accounts/logout', {}, token)
  } catch {
    // best effort — the token is being thrown away anyway
  }
}

// Resolve the current session against the server. Used on app boot to
// confirm the cached session is still valid. Returns null on any failure
// (network or unauthorized).
export async function getMe(token: string): Promise<ServerAccount | null> {
  try {
    const { res, json } = await getJson<{ ok: boolean; account?: ServerAccount }>(
      '/accounts/me',
      token
    )
    if (!res.ok || !json?.ok || !json.account) return null
    return json.account
  } catch {
    return null
  }
}

// ── Inbox ───────────────────────────────────────────────────────────────

export async function listInbox(
  token: string,
  since?: number
): Promise<InboxItemFromServer[]> {
  try {
    const suffix = since !== undefined ? `?since=${since}` : ''
    const { res, json } = await getJson<{
      ok: boolean
      items?: InboxItemFromServer[]
    }>(`/inbox${suffix}`, token)
    if (!res.ok || !json?.ok || !Array.isArray(json.items)) return []
    return json.items
  } catch {
    return []
  }
}

export async function dismissInbox(token: string, id: string): Promise<void> {
  try {
    await fetch(urlFor(`/inbox/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
  } catch {
    // ignore
  }
}
