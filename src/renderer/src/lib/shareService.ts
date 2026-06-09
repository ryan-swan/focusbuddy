// ShareService — REST client for the focusbuddy-signal share endpoints.
// Wraps fetch() so the shares store can talk to the hosted service without
// caring about HTTP semantics.
//
// The renderer's existing local SQLite tables (share_links + shared_with_me)
// stay in place — they're the source of truth for THIS user's outgoing
// links and accepted incoming items. ShareService is the *bridge* to the
// hosted side: when a user creates a share, the snapshot also gets posted
// to the server so other users can resolve the token. When accepting a
// link, the renderer looks the token up on the server, then inserts the
// resolved snapshot into the local inbox.

import type { ShareableKind, ShareScope } from '@shared/types'

export interface MintShareInput {
  token: string
  kind: ShareableKind
  snapshot: unknown
  fromHandle: string
  scope: ShareScope
  expiresAt: number | null
}

export interface ShareRecipientDto {
  email: string
  handle: string | null
  status: 'invited' | 'accepted'
}

export interface LookupShareResult {
  token: string
  kind: ShareableKind
  snapshot: unknown
  fromHandle: string
  scope: ShareScope
  createdAt: number
}

export class ShareService {
  private baseUrl: string

  constructor(baseUrl: string) {
    // Strip any trailing slash so url joins below stay tidy.
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  // Owner mints a share. Returns the viewer URL the hosted service confirms
  // — same one the renderer would build from the token, but we trust the
  // server's response so the viewer host can move without a client update.
  async mint(input: MintShareInput): Promise<{ viewerUrl: string }> {
    const res = await fetch(`${this.baseUrl}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })
    if (!res.ok) {
      const detail = await safeText(res)
      throw new Error(
        `Share service rejected mint (${res.status}): ${detail}`
      )
    }
    const body = (await res.json()) as { ok?: boolean; viewerUrl?: string }
    if (!body.viewerUrl) {
      throw new Error('Share service returned no viewerUrl.')
    }
    return { viewerUrl: body.viewerUrl }
  }

  // Recipient resolves a share. The hosted service streams back the
  // snapshot the original owner posted, and increments the view counter
  // so the share manager can show "how many people opened this".
  async lookup(token: string): Promise<LookupShareResult> {
    const res = await fetch(`${this.baseUrl}/share/${encodeURIComponent(token)}`)
    if (res.status === 404) {
      throw new Error('Share not found, expired, or revoked.')
    }
    if (!res.ok) {
      throw new Error(`Share service error (${res.status}).`)
    }
    return (await res.json()) as LookupShareResult
  }

  // Owner invites someone to a share by email. Server records the recipient
  // and emails them the viewer link. Owner-authenticated.
  async invite(
    token: string,
    email: string,
    sessionToken: string
  ): Promise<{ recipient: ShareRecipientDto; emailDelivered: boolean }> {
    const res = await fetch(`${this.baseUrl}/share/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ token, email })
    })
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      recipient?: ShareRecipientDto
      emailDelivered?: boolean
      error?: string
    }
    if (!res.ok || !body.ok || !body.recipient) {
      throw new Error(body.error || `Invite failed (${res.status}).`)
    }
    return { recipient: body.recipient, emailDelivered: !!body.emailDelivered }
  }

  // List recipients for one or more of the owner's shares (for the avatars).
  async recipients(
    tokens: string[],
    sessionToken: string
  ): Promise<Record<string, ShareRecipientDto[]>> {
    if (tokens.length === 0) return {}
    const res = await fetch(
      `${this.baseUrl}/share/recipients?tokens=${encodeURIComponent(tokens.join(','))}`,
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    )
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      byToken?: Record<string, ShareRecipientDto[]>
    }
    if (!res.ok || !body.ok) return {}
    return body.byToken ?? {}
  }

  // Owner revokes a share. The hosted side stops resolving it but the
  // local share_links row stays (marked revoked) so the share manager
  // shows the audit history.
  async revoke(token: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/share/${encodeURIComponent(token)}`, {
      method: 'DELETE'
    })
    if (!res.ok && res.status !== 404) {
      const detail = await safeText(res)
      throw new Error(
        `Share service rejected revoke (${res.status}): ${detail}`
      )
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
