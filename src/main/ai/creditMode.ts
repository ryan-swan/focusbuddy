// Credit mode — routing AI calls through the PlexiDesk signal server on our
// Anthropic key, billed against the account's prepaid balance, with automatic
// fall-back to the user's own key (BYOK) when credits run out.
//
// This is the desktop half of the metered proxy. The backend half lives in
// focusbuddy-signal (src/aiCredits.ts + the /ai/anthropic proxy route). The
// design goal here is zero churn at the ~20 AI call sites: getClient() in
// anthropic.ts decides credits-vs-BYOK once per call, and the metered fetch
// installed on the credit client transparently handles the out-of-credits
// hand-off, so no call site needs to know which path it took.

import type Anthropic from '@anthropic-ai/sdk'
import { createAnthropic } from './modelClient'
import { loadAccountState } from '../db/account'
import { getAiMode, resolveAnthropicKey, hasOwnAnthropicKey } from '../settingsStore'

// The signal server base. Defaults to production; overridable for local
// testing against a dev server (the env var the test harness sets).
export const SIGNAL_BASE =
  process.env.FB_SIGNAL_URL ?? process.env.SIGNAL_HTTP_URL ?? 'https://focusbuddy-signal.fly.dev'

const REAL_ANTHROPIC = 'https://api.anthropic.com/v1/messages'

// Cached view of the account's credit state. balanceUsd is null until the
// first successful fetch or metered call — "unknown", which getClient treats
// optimistically so a signed-in user's very first call still tries credits.
interface CreditCache {
  balanceUsd: number | null
  outOfCredits: boolean
  proxyAvailable: boolean
}
const creditCache: CreditCache = {
  balanceUsd: null,
  outOfCredits: false,
  proxyAvailable: true
}

function sessionToken(): string | null {
  return loadAccountState().sessionToken
}

/**
 * Decide whether the next call should go through credits. Pure policy, no
 * network. 'byok' never uses credits; 'credits' always does (when signed in);
 * 'auto' uses credits unless we know the balance is spent and the user has
 * their own key to fall back to.
 */
export function shouldUseCredits(): boolean {
  const token = sessionToken()
  if (!token) return false
  const mode = getAiMode()
  if (mode === 'byok') return false
  if (mode === 'credits') return true
  // auto
  // If we've learned the server proxy is unavailable (no proxy key configured
  // server-side, i.e. credit mode isn't activated yet), don't bounce off it.
  // Behave exactly like BYOK so a personal-key user is unaffected and a no-key
  // user gets the normal "add a key" prompt instead of a 503. This is what lets
  // the feature ship dormant and light up the moment the server key is set.
  if (creditCache.proxyAvailable === false) return false
  if (creditCache.balanceUsd !== null && creditCache.balanceUsd <= 0 && hasOwnAnthropicKey()) {
    return false
  }
  return true
}

// The metered fetch handed to the credit-mode Anthropic client. It reads the
// balance the server echoes on every billed response, and on a 402 (out of
// credits) it either transparently retries on the user's own key (auto mode)
// or lets the 402 surface so the UI can prompt a top-up.
function meteredFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Transparently re-run the same request against Anthropic on the user's own
    // key — but only in 'auto' mode (in 'credits' mode they explicitly chose the
    // proxy, so we never spend their key without consent). Returns null when no
    // fall-back is possible.
    const ownKeyRetry = (): Promise<Response> | null => {
      const ownKey = resolveAnthropicKey()
      if (getAiMode() === 'auto' && ownKey && init?.body) {
        const headers = new Headers(init?.headers as HeadersInit | undefined)
        headers.delete('authorization')
        headers.set('x-api-key', ownKey)
        return fetch(REAL_ANTHROPIC, { ...init, headers })
      }
      return null
    }

    let res: Response
    try {
      res = await fetch(input, init)
    } catch (err) {
      // The proxy is unreachable (network/DNS/TLS, or a misconfigured base URL).
      // A personal-key user must never be stranded behind a bare "Connection
      // error" — in auto mode, use their key directly; otherwise record the
      // outage so getClient prefers BYOK next time, and rethrow.
      creditCache.proxyAvailable = false
      const fb = ownKeyRetry()
      if (fb) return fb
      throw err
    }

    if (res.status === 402) {
      creditCache.outOfCredits = true
      creditCache.balanceUsd = 0
      const fb = ownKeyRetry()
      return fb ?? res
    }

    // 503 (no proxy key), 404 (endpoint missing), or any 5xx — the proxy cannot
    // serve this call. Prefer the personal key in auto mode; otherwise mark the
    // proxy unavailable and surface an actionable message rather than a raw error.
    if (res.status === 503 || res.status === 404 || res.status >= 500) {
      creditCache.proxyAvailable = false
      const fb = ownKeyRetry()
      if (fb) return fb
      return new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'proxy_unavailable',
            message:
              'AI credits are temporarily unavailable. Add your own Anthropic API key in Settings → AI · API keys to keep using AI.'
          }
        }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      )
    }

    const balHeader = res.headers.get('x-pd-credit-balance')
    if (balHeader !== null) {
      const bal = Number(balHeader)
      if (Number.isFinite(bal)) {
        creditCache.balanceUsd = bal
        creditCache.outOfCredits = bal <= 0
      }
    }
    return res
  }) as typeof fetch
}

// Cache the credit client by the session token it authenticates as, so a
// re-login swaps to a fresh client without an app restart.
let creditClient: { token: string; instance: Anthropic } | null = null

/** Build (or reuse) the Anthropic client that points at our metered proxy. */
export function getCreditClient(): Anthropic | null {
  const token = sessionToken()
  if (!token) return null
  if (!creditClient || creditClient.token !== token) {
    creditClient = {
      token,
      instance: createAnthropic({
        // The proxy authenticates via Authorization: Bearer <session token>,
        // not x-api-key, so the apiKey here is an ignored placeholder.
        apiKey: 'pd-proxy',
        baseURL: `${SIGNAL_BASE}/ai/anthropic`,
        defaultHeaders: { Authorization: `Bearer ${token}` },
        fetch: meteredFetch(),
        // The proxy gates and bills server-side; don't let the SDK retry a
        // 402/503 and double-spend or spin.
        maxRetries: 0
      })
    }
  }
  return creditClient.instance
}

/** Drop the cached credit client (called when the session or key changes). */
export function invalidateCreditClient(): void {
  creditClient = null
}

/**
 * DEC-051 — is THIS client the metered proxy?
 *
 * Streaming call sites must know whether the request will hit the proxy (which
 * rejects streaming outright, 400 "Streaming is not supported on PlexiDesk
 * credits"). Asking policy — `shouldUseCredits() && getCreditClient() === c` —
 * is a race: the client is resolved once at the top of a long turn, and by the
 * time the model call runs, retrieval's own AI calls may have moved the
 * balance (auto mode then prefers BYOK) or a settings change may have
 * invalidated the cached instance. Policy says "not credits", the client still
 * IS the proxy, and the stream 400s in the user's face.
 *
 * The client's own baseURL cannot drift out from under the request it is about
 * to make, so that is what we read.
 */
export function isCreditClient(c: { baseURL?: string } | null | undefined): boolean {
  const base = c?.baseURL
  return typeof base === 'string' && base.startsWith(SIGNAL_BASE)
}

/** The proxy's refusal, matched on the wire text rather than the status alone
 *  (a 400 has many causes; only this one is retryable non-streamed). */
export function isStreamingUnsupported(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err ?? '')
  return /streaming is not supported/i.test(msg)
}

/** Fetch the live balance from the server and refresh the cache. */
export async function refreshCredits(): Promise<CreditCache> {
  const token = sessionToken()
  if (!token) {
    creditCache.balanceUsd = null
    return { ...creditCache }
  }
  try {
    const res = await fetch(`${SIGNAL_BASE}/ai/credits`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const body = (await res.json()) as {
        balanceUsd?: number
        proxyAvailable?: boolean
      }
      if (typeof body.balanceUsd === 'number') {
        creditCache.balanceUsd = body.balanceUsd
        creditCache.outOfCredits = body.balanceUsd <= 0
      }
      if (typeof body.proxyAvailable === 'boolean') {
        creditCache.proxyAvailable = body.proxyAvailable
      }
    }
  } catch {
    // Network blip — keep the last-known cache rather than inventing a number.
  }
  return { ...creditCache }
}

export interface AiStatus {
  mode: ReturnType<typeof getAiMode>
  signedIn: boolean
  hasOwnKey: boolean
  balanceUsd: number | null
  outOfCredits: boolean
  proxyAvailable: boolean
}

/** Snapshot for the renderer's settings panel and out-of-credits prompts. */
export function getAiStatus(): AiStatus {
  return {
    mode: getAiMode(),
    signedIn: Boolean(sessionToken()),
    hasOwnKey: hasOwnAnthropicKey(),
    balanceUsd: creditCache.balanceUsd,
    outOfCredits: creditCache.outOfCredits,
    proxyAvailable: creditCache.proxyAvailable
  }
}

export interface TopUpResult {
  ok: boolean
  action?: 'redirect' | 'pending'
  url?: string
  amountUsd?: number
  error?: string
}

/** Start a Stripe checkout to buy more credits; returns the URL to open. */
export async function startTopUp(amountUsd: number): Promise<TopUpResult> {
  const token = sessionToken()
  if (!token) return { ok: false, error: 'Sign in to add credits.' }
  try {
    const res = await fetch(`${SIGNAL_BASE}/ai/credits/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amountUsd })
    })
    if (!res.ok) return { ok: false, error: `Checkout failed (${res.status}).` }
    const body = (await res.json()) as {
      action?: 'redirect' | 'pending'
      url?: string
      amountUsd?: number
    }
    return { ok: true, action: body.action, url: body.url, amountUsd: body.amountUsd }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
