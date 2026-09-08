import { SIGNAL_BASE } from './ai/creditMode'
import { loadAccountState } from './db/account'
import {
  getLiveDesk,
  getLiveDeskByToken,
  listLiveDesks,
  upsertLiveDesk,
  recordPublish,
  recordPublishError,
  setLiveDeskPaused,
  removeLiveDesk,
  type LiveDeskRecord
} from './db/liveDesks'

// Publishing side of the public live desk.
//
// The renderer builds a sanitized projection; this module gets it to Signal and
// keeps the local record of what is actually live. Three things matter here and
// are easy to get wrong:
//
//  - Publishing is debounced. Dragging a widget emits a change per frame, and
//    each one must not become an HTTP request.
//  - Publishing is conditional. An offline machine that comes back must not
//    overwrite a newer revision published from another of the owner's devices,
//    so every publish carries its base revision as If-Match and a 412 is
//    resolved by re-reading rather than by forcing.
//  - Failures are recorded, not swallowed. An owner who thinks a page is live
//    when publishing has been failing for an hour is worse off than one who is
//    told, so the error is persisted and surfaced in the share manager.

/** Changes settle for this long before a revision is published. */
export const PUBLISH_DEBOUNCE_MS = 750
/** Bounded backoff for retrying a failed publish. */
const RETRY_DELAYS_MS = [1_000, 4_000, 15_000, 60_000]

export interface PublishResult {
  ok: boolean
  revision?: number
  error?: string
}

function authHeaders(): Record<string, string> | null {
  const token = loadAccountState().sessionToken
  if (!token) return null
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

/** Create a live desk share. Requires a signed-in account by design. */
export async function createLiveDesk(
  deskId: string,
  fromHandle?: string
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const headers = authHeaders()
  if (!headers) return { ok: false, error: 'Sign in to publish a desk to the web.' }
  try {
    const res = await fetch(`${SIGNAL_BASE}/shares/desks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deskId, fromHandle })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: (body as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    const { token } = (await res.json()) as { token: string }
    upsertLiveDesk(deskId, token)
    return { ok: true, token }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the server.' }
  }
}

/**
 * Publish one revision. `projection` has already been sanitized by the
 * renderer's builder; Signal validates it again on arrival, which is the check
 * that actually matters.
 */
export async function publishProjection(
  deskId: string,
  projection: unknown
): Promise<PublishResult> {
  const record = getLiveDesk(deskId)
  if (!record) return { ok: false, error: 'This desk is not published.' }
  if (record.paused) return { ok: false, error: 'Publishing is paused for this desk.' }
  const headers = authHeaders()
  if (!headers) return { ok: false, error: 'Sign in to publish a desk to the web.' }

  try {
    const res = await fetch(`${SIGNAL_BASE}/shares/desks/${record.token}/projection`, {
      method: 'PUT',
      headers: { ...headers, 'if-match': `"${record.revision}"` },
      body: JSON.stringify(projection)
    })
    if (res.status === 412) {
      // Another of the owner's machines published while this one was behind.
      // Adopt the server's revision and let the next change publish cleanly
      // rather than clobbering newer content.
      const body = (await res.json().catch(() => ({}))) as { revision?: number }
      if (typeof body.revision === 'number') recordPublish(deskId, body.revision)
      return { ok: false, error: 'A newer version was published elsewhere.' }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] }
      const msg = body.details?.length
        ? `${body.error ?? `HTTP ${res.status}`}: ${body.details[0]}`
        : (body.error ?? `HTTP ${res.status}`)
      recordPublishError(deskId, msg)
      return { ok: false, error: msg }
    }
    const { revision } = (await res.json()) as { revision: number }
    recordPublish(deskId, revision)
    return { ok: true, revision }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not reach the server.'
    recordPublishError(deskId, msg)
    return { ok: false, error: msg }
  }
}

export async function uploadLiveAsset(
  deskId: string,
  assetId: string,
  mime: string,
  bytes: Uint8Array
): Promise<{ ok: boolean; error?: string }> {
  const record = getLiveDesk(deskId)
  if (!record) return { ok: false, error: 'This desk is not published.' }
  const session = loadAccountState().sessionToken
  if (!session) return { ok: false, error: 'Sign in to publish a desk to the web.' }
  try {
    const res = await fetch(
      `${SIGNAL_BASE}/shares/desks/${record.token}/assets/${assetId}?mime=${encodeURIComponent(mime)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session}`, 'content-type': 'application/octet-stream' },
        // Cast: Node's fetch accepts a typed array, but the DOM BodyInit type
        // in this project's lib set does not name Uint8Array.
        body: bytes as unknown as BodyInit
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upload failed.' }
  }
}

export async function setLivePaused(
  deskId: string,
  paused: boolean
): Promise<{ ok: boolean; error?: string }> {
  const record = getLiveDesk(deskId)
  if (!record) return { ok: false, error: 'This desk is not published.' }
  const headers = authHeaders()
  if (!headers) return { ok: false, error: 'Sign in to manage this desk.' }
  try {
    const res = await fetch(`${SIGNAL_BASE}/shares/desks/${record.token}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paused })
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    setLiveDeskPaused(deskId, paused)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the server.' }
  }
}

/** Revoke the public link entirely. Signal tears down streams and assets. */
export async function stopLiveDesk(deskId: string): Promise<{ ok: boolean; error?: string }> {
  const record = getLiveDesk(deskId)
  if (!record) return { ok: true }
  const headers = authHeaders()
  if (!headers) return { ok: false, error: 'Sign in to manage this desk.' }
  try {
    const res = await fetch(`${SIGNAL_BASE}/share/${record.token}`, { method: 'DELETE', headers })
    if (!res.ok && res.status !== 404) return { ok: false, error: `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the server.' }
  }
  removeLiveDesk(deskId)
  return { ok: true }
}

export function liveDeskFor(deskId: string): LiveDeskRecord | null {
  return getLiveDesk(deskId)
}
export function liveDeskForToken(token: string): LiveDeskRecord | null {
  return getLiveDeskByToken(token)
}
export function allLiveDesks(): LiveDeskRecord[] {
  return listLiveDesks()
}

// --- Debounced publishing ---------------------------------------------------

interface Pending {
  timer: NodeJS.Timeout | null
  retry: number
  latest: unknown
  inFlight: boolean
}
const pending = new Map<string, Pending>()

/**
 * Queue a projection for publication. Repeated calls collapse into one request
 * once changes stop, and a failure retries with bounded backoff using whatever
 * the newest projection is at that moment -- never a stale queued one.
 */
export function queuePublish(deskId: string, projection: unknown): void {
  let p = pending.get(deskId)
  if (!p) {
    p = { timer: null, retry: 0, latest: projection, inFlight: false }
    pending.set(deskId, p)
  }
  p.latest = projection
  if (p.timer) clearTimeout(p.timer)
  p.timer = setTimeout(() => void flush(deskId), PUBLISH_DEBOUNCE_MS)
}

async function flush(deskId: string): Promise<void> {
  const p = pending.get(deskId)
  if (!p || p.inFlight) return
  p.timer = null
  p.inFlight = true
  const result = await publishProjection(deskId, p.latest)
  p.inFlight = false
  if (result.ok) {
    p.retry = 0
    // Nothing newer arrived while publishing, so the queue is clean.
    if (!p.timer) pending.delete(deskId)
    return
  }
  // Bounded backoff. After the last delay the error stays recorded and the next
  // real change will try again; we do not spin forever against a broken server.
  const delay = RETRY_DELAYS_MS[Math.min(p.retry, RETRY_DELAYS_MS.length - 1)]
  if (p.retry < RETRY_DELAYS_MS.length) {
    p.retry += 1
    p.timer = setTimeout(() => void flush(deskId), delay)
  } else {
    pending.delete(deskId)
  }
}

/** Test seam: drop queued work without publishing it. */
export function _resetPublishQueue(): void {
  for (const p of pending.values()) if (p.timer) clearTimeout(p.timer)
  pending.clear()
}
