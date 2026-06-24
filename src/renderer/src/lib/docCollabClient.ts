// REST client for live (collaborative) documents on the signal server. Lives in
// the renderer because it's pure fetch — main doesn't proxy network calls. Auth
// is the account session token as a Bearer header, like accountClient/messaging.

import { signalConfig } from './signalConfig'

export interface LiveDocMeta {
  id: string
  ownerAccountId: string
  docType: 'doc' | 'sheet' | 'slides' | 'map' | 'canvas' | 'folder'
  title: string
  version: number
  updatedBy: string | null
  createdAt: number
  updatedAt: number
}
export interface LockHolder {
  accountId: string
  handle: string
}
export interface LockState {
  docId: string
  holder: LockHolder | null
  expiresAt: number | null
}
export interface LiveDocFull extends LiveDocMeta {
  body: string
  members: LockHolder[]
  lock: LockState
}
export interface LiveDocListItem extends LiveDocMeta {
  lock: LockHolder | null
  lockExpiresAt: number | null
}
export interface Takeover {
  id: string
  docId: string
  requesterAccountId: string
  holderAccountId: string
  message: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  responseMessage: string | null
  createdAt: number
  resolvedAt: number | null
  docTitle?: string
  requesterHandle?: string
}

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

// Returns the parsed JSON plus ok/status so callers can branch on 409 (locked).
async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  token: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; json: T | null }> {
  try {
    const res = await fetch(urlFor(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    let json: T | null = null
    try {
      json = (await res.json()) as T
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

export async function createLiveDoc(
  token: string,
  input: { docType: string; title: string; body: string }
): Promise<LiveDocMeta | null> {
  const { json } = await call<{ ok: boolean; doc?: LiveDocMeta }>('POST', '/livedocs', token, input)
  return json?.ok ? json.doc ?? null : null
}

export async function listLiveDocs(token: string): Promise<LiveDocListItem[]> {
  const { json } = await call<{ ok: boolean; docs?: LiveDocListItem[] }>('GET', '/livedocs', token)
  return json?.ok ? json.docs ?? [] : []
}

export async function getLiveDoc(token: string, id: string): Promise<LiveDocFull | null> {
  const { json } = await call<{ ok: boolean; doc?: LiveDocFull }>('GET', `/livedocs/${id}`, token)
  return json?.ok ? json.doc ?? null : null
}

// Acquire/refresh the lock. ok=true with the lock, or ok=false carrying the
// current holder (someone else is editing).
export async function lockDoc(
  token: string,
  id: string
): Promise<{ ok: boolean; lock: LockState | null }> {
  const { ok, json } = await call<{ ok: boolean; lock?: LockState }>('POST', `/livedocs/${id}/lock`, token)
  return { ok: ok && !!json?.ok, lock: json?.lock ?? null }
}

export async function releaseDoc(token: string, id: string): Promise<void> {
  await call('POST', `/livedocs/${id}/release`, token)
}

export async function putLiveBody(
  token: string,
  id: string,
  body: string
): Promise<{ ok: boolean; version: number | null; lock: LockState | null }> {
  const { ok, json } = await call<{ ok: boolean; version?: number; lock?: LockState }>(
    'PUT',
    `/livedocs/${id}/body`,
    token,
    { body }
  )
  return { ok: ok && !!json?.ok, version: json?.version ?? null, lock: json?.lock ?? null }
}

// Persist a CRDT snapshot of the body (co-editing path). Lock-free; the server
// stores it without notifying anyone, so the live editors aren't disrupted.
export async function snapshotLiveBody(token: string, id: string, body: string): Promise<void> {
  await call('PUT', `/livedocs/${id}/snapshot`, token, { body })
}

// ── Comments ────────────────────────────────────────────────────────────────
export interface DocComment {
  id: string
  docId: string
  authorAccountId: string
  parentId: string | null
  body: string
  resolved: boolean
  createdAt: number
}

export async function listComments(token: string, docId: string): Promise<DocComment[]> {
  const { json } = await call<{ ok: boolean; comments?: DocComment[] }>('GET', `/livedocs/${docId}/comments`, token)
  return json?.comments ?? []
}

export async function addComment(
  token: string,
  docId: string,
  body: string,
  opts?: { id?: string; parentId?: string }
): Promise<DocComment | null> {
  const { json } = await call<{ ok: boolean; comment?: DocComment }>('POST', `/livedocs/${docId}/comments`, token, {
    body,
    id: opts?.id,
    parentId: opts?.parentId
  })
  return json?.comment ?? null
}

export async function resolveComment(token: string, commentId: string, resolved: boolean): Promise<void> {
  await call('POST', `/livedocs/comments/${commentId}/resolve`, token, { resolved })
}

export async function deleteComment(token: string, commentId: string): Promise<void> {
  await call('DELETE', `/livedocs/comments/${commentId}`, token)
}

export async function renameLiveDoc(token: string, id: string, title: string): Promise<void> {
  await call('POST', `/livedocs/${id}/title`, token, { title })
}

export async function inviteToLiveDoc(
  token: string,
  id: string,
  handle: string
): Promise<{ ok: boolean; member?: LockHolder; error?: string }> {
  const { json } = await call<{ ok: boolean; member?: LockHolder; error?: string }>(
    'POST',
    `/livedocs/${id}/invite`,
    token,
    { handle }
  )
  return { ok: !!json?.ok, member: json?.member, error: json?.error }
}

export async function requestTakeover(token: string, id: string, message: string): Promise<boolean> {
  const { json } = await call<{ ok: boolean }>('POST', `/livedocs/${id}/takeover`, token, { message })
  return !!json?.ok
}

export async function listTakeovers(token: string): Promise<Takeover[]> {
  const { json } = await call<{ ok: boolean; requests?: Takeover[] }>('GET', '/livedocs/takeovers', token)
  return json?.ok ? json.requests ?? [] : []
}

export async function respondTakeover(
  token: string,
  tid: string,
  accept: boolean,
  message: string
): Promise<boolean> {
  const { json } = await call<{ ok: boolean }>('POST', `/livedocs/takeovers/${tid}/respond`, token, {
    accept,
    message
  })
  return !!json?.ok
}
