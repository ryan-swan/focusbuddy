import { signalConfig } from './signalConfig'

// Client for the signal's per-ORG synced KV (/orgs/:id/state/:key). Symmetric with
// accountStateClient but org-scoped: any member may read, only an admin/owner may
// write (the server enforces the role via authorizeOrg). Used for small org-wide
// client state such as the assistant autonomy policy an admin sets once for the
// whole org. Best-effort reads (null on failure); writes report ok/false so the UI
// can show an honest "couldn't save / admins only" state.

function urlFor(orgId: string, key: string): string {
  return (
    signalConfig.httpUrl.replace(/\/+$/, '') +
    `/orgs/${encodeURIComponent(orgId)}/state/${encodeURIComponent(key)}`
  )
}

export async function getOrgState<T>(token: string, orgId: string, key: string): Promise<T | null> {
  try {
    const res = await fetch(urlFor(orgId, key), { headers: { Authorization: `Bearer ${token}` } })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; value?: T | null } | null
    return json?.ok ? (json.value ?? null) : null
  } catch {
    return null
  }
}

export interface OrgStateWriteResult {
  ok: boolean
  // Distinguish "you're not allowed" (403) from a transport failure, so the UI can
  // say "admins only" rather than a generic error.
  forbidden?: boolean
}

export async function setOrgState(
  token: string,
  orgId: string,
  key: string,
  value: unknown
): Promise<OrgStateWriteResult> {
  try {
    const res = await fetch(urlFor(orgId, key), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    if (res.status === 403) return { ok: false, forbidden: true }
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null
    return { ok: !!json?.ok }
  } catch {
    return { ok: false }
  }
}
