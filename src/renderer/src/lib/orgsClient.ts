import { signalConfig } from './signalConfig'

// Client for the organization / membership / roles API on the signal server.
// Pure fetch with the account session token, same pattern as docCollabClient.

export type OrgRole = 'owner' | 'admin' | 'member' | 'guest'

export interface OrgMembership {
  id: string
  name: string
  slug: string | null
  personal: boolean
  role: OrgRole
  memberCount: number
  createdAt: number
}
export interface OrgMember {
  accountId: string
  role: OrgRole
  addedAt: number
  handle: string
}
export interface OrgInvite {
  id: string
  orgId: string
  email: string
  role: OrgRole
  invitedBy: string
  createdAt: number
}
export interface OrgDetail {
  org: { id: string; name: string; personal: boolean }
  role: OrgRole | null
  members: OrgMember[]
  invites: OrgInvite[]
}

function url(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

async function call<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
): Promise<{ ok: boolean; status: number; json: T | null }> {
  try {
    const res = await fetch(url(path), {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    let json: T | null = null
    try {
      json = (await res.json()) as T
    } catch {
      /* ignore */
    }
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

export async function listOrgs(token: string): Promise<OrgMembership[]> {
  const { json } = await call<{ ok: boolean; orgs?: OrgMembership[] }>('GET', '/orgs', token)
  return json?.orgs ?? []
}
export async function getOrg(token: string, id: string): Promise<OrgDetail | null> {
  const { json } = await call<{ ok: boolean } & OrgDetail>('GET', `/orgs/${id}`, token)
  return json?.ok ? { org: json.org, role: json.role, members: json.members, invites: json.invites } : null
}
export async function createOrg(token: string, name: string): Promise<OrgMembership | null> {
  const { json } = await call<{ ok: boolean; org?: OrgMembership }>('POST', '/orgs', token, { name })
  return json?.org ?? null
}
export async function renameOrg(token: string, id: string, name: string): Promise<void> {
  await call('POST', `/orgs/${id}/rename`, token, { name })
}
export async function inviteMember(
  token: string,
  id: string,
  email: string,
  role: OrgRole
): Promise<{ ok: boolean; added?: boolean; error?: string }> {
  const { json } = await call<{ ok: boolean; added?: boolean; error?: string }>('POST', `/orgs/${id}/members`, token, { email, role })
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function setMemberRole(
  token: string,
  id: string,
  accountId: string,
  role: OrgRole
): Promise<{ ok: boolean; error?: string }> {
  const { json } = await call<{ ok: boolean; error?: string }>('POST', `/orgs/${id}/members/${accountId}/role`, token, { role })
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function removeMember(
  token: string,
  id: string,
  accountId: string
): Promise<{ ok: boolean; error?: string }> {
  const { json } = await call<{ ok: boolean; error?: string }>('DELETE', `/orgs/${id}/members/${accountId}`, token)
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function revokeInvite(token: string, id: string, inviteId: string): Promise<void> {
  await call('DELETE', `/orgs/${id}/invites/${inviteId}`, token)
}
export async function deleteOrg(token: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const { json } = await call<{ ok: boolean; error?: string }>('DELETE', `/orgs/${id}`, token)
  return json ?? { ok: false, error: 'Request failed.' }
}
