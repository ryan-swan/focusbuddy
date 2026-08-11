import { signalConfig } from './signalConfig'
import { useAccountStore } from '../stores/account'

// Renderer client for per-desk live sharing (share a desk with named individuals so
// they get bidirectional near-live updates). It talks to the signal /workspace/desk
// and /workspace/shared routes with the plain account bearer token — access rides
// resource_acls grants, not org membership. Sharing also stamps the desk subtree
// locally (via main) so it starts flowing down the ACL-scoped shared sync path, and
// kicks an immediate cycle so grantees see it within a second or two.

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}
function token(): string | null {
  return useAccountStore.getState().sessionToken
}

export interface DeskAccessGrant {
  accountId: string
  handle: string
  name: string
  email: string | null
  permission: string
}
export interface DeskAccess {
  owner: string | null
  grants: DeskAccessGrant[]
  pending: Array<{ email: string; permission: string }>
}
export interface DeskInvite {
  accountId?: string
  email?: string
  permission?: string
}

// Share a desk live with the given people. Stamps the subtree locally first so it
// syncs down the shared path, registers the grants on the server, then kicks a
// sync so the desk pushes immediately. Returns the refreshed access list.
export async function shareDeskLive(
  rootId: string,
  invites: DeskInvite[],
  permission: 'view' | 'edit' = 'edit'
): Promise<{ ok: boolean; access?: DeskAccess; error?: string }> {
  const t = token()
  if (!t) return { ok: false, error: 'Not signed in.' }
  try {
    await window.api.workspaceSync.stampSharedDesk(rootId)
    const res = await fetch(urlFor('/workspace/desk/share'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootId, invites, permission })
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; access?: DeskAccess; error?: string }
    if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Could not share the desk.' }
    // Push the freshly-stamped desk to the server now, so grantees can pull it.
    const { syncWorkspaceOnce } = await import('./workspaceSync')
    void syncWorkspaceOnce()
    return { ok: true, access: json.access }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error.' }
  }
}

export async function getDeskAccess(rootId: string): Promise<DeskAccess | null> {
  const t = token()
  if (!t) return null
  try {
    const res = await fetch(urlFor(`/workspace/desk/${rootId}/access`), {
      headers: { Authorization: `Bearer ${t}` }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; access?: DeskAccess }
    return json.ok && json.access ? json.access : null
  } catch {
    return null
  }
}

export async function revokeDeskAccess(rootId: string, accountId: string): Promise<DeskAccess | null> {
  const t = token()
  if (!t) return null
  try {
    const res = await fetch(urlFor(`/workspace/desk/${rootId}/access/${accountId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; access?: DeskAccess }
    return json.ok && json.access ? json.access : null
  } catch {
    return null
  }
}

export async function revokeDeskInvite(rootId: string, email: string): Promise<DeskAccess | null> {
  const t = token()
  if (!t) return null
  try {
    const res = await fetch(urlFor(`/workspace/desk/${rootId}/invite?email=${encodeURIComponent(email)}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; access?: DeskAccess }
    return json.ok && json.access ? json.access : null
  } catch {
    return null
  }
}
