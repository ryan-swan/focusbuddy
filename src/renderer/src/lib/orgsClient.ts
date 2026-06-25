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

/* ---------------- People Map: offices, profiles, working hours ---------------- */

export type OfficeKind = 'physical' | 'remote' | 'external'
export interface Office {
  id: string
  orgId: string
  name: string
  kind: OfficeKind
  city: string | null
  lat: number | null
  lng: number | null
  tzOffsetMin: number
  workStart: number | null
  workEnd: number | null
  accent: string | null
  createdAt: number
}
export interface OfficeInput {
  name?: string
  kind?: OfficeKind
  city?: string | null
  lat?: number | null
  lng?: number | null
  tzOffsetMin?: number
  workStart?: number | null
  workEnd?: number | null
  accent?: string | null
}
export interface MemberProfile {
  orgId: string
  accountId: string
  title: string | null
  department: string | null
  officeId: string | null
  managerAccountId: string | null
  workStart: number | null
  workEnd: number | null
  city: string | null
  lat: number | null
  lng: number | null
  tzOffsetMin: number | null
  updatedAt: number
}
export type ProfilePatch = Partial<Omit<MemberProfile, 'orgId' | 'accountId' | 'updatedAt'>>
export interface WorkWindow {
  start: number
  end: number
}
export interface PeopleMapPerson {
  accountId: string
  handle: string
  role: OrgRole
  title: string | null
  department: string | null
  officeId: string | null
  managerAccountId: string | null
  city: string | null
  lat: number | null
  lng: number | null
  tzOffsetMin: number | null
  workWindow: WorkWindow
}
export interface PeopleMap {
  orgId: string
  defaultHours: WorkWindow
  offices: Office[]
  people: PeopleMapPerson[]
}

export async function getOrgHours(token: string, id: string): Promise<WorkWindow> {
  const { json } = await call<{ ok: boolean; hours?: WorkWindow }>('GET', `/orgs/${id}/settings`, token)
  return json?.hours ?? { start: 9, end: 17 }
}
export async function setOrgHours(token: string, id: string, hours: WorkWindow): Promise<{ ok: boolean; error?: string }> {
  const { json } = await call<{ ok: boolean; error?: string }>('PUT', `/orgs/${id}/settings`, token, hours)
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function listOffices(token: string, id: string): Promise<Office[]> {
  const { json } = await call<{ ok: boolean; offices?: Office[] }>('GET', `/orgs/${id}/offices`, token)
  return json?.offices ?? []
}
export async function createOffice(token: string, id: string, input: OfficeInput): Promise<{ ok: boolean; office?: Office; error?: string }> {
  const { json } = await call<{ ok: boolean; office?: Office; error?: string }>('POST', `/orgs/${id}/offices`, token, input)
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function updateOffice(token: string, id: string, officeId: string, patch: OfficeInput): Promise<{ ok: boolean; office?: Office; error?: string }> {
  const { json } = await call<{ ok: boolean; office?: Office; error?: string }>('PATCH', `/orgs/${id}/offices/${officeId}`, token, patch)
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function deleteOffice(token: string, id: string, officeId: string): Promise<{ ok: boolean; error?: string }> {
  const { json } = await call<{ ok: boolean; error?: string }>('DELETE', `/orgs/${id}/offices/${officeId}`, token)
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function getMemberProfile(token: string, id: string, accountId: string): Promise<MemberProfile | null> {
  const { json } = await call<{ ok: boolean; profile?: MemberProfile }>('GET', `/orgs/${id}/members/${accountId}/profile`, token)
  return json?.profile ?? null
}
export async function setMemberProfile(token: string, id: string, accountId: string, patch: ProfilePatch): Promise<{ ok: boolean; profile?: MemberProfile; error?: string }> {
  const { json } = await call<{ ok: boolean; profile?: MemberProfile; error?: string }>('PUT', `/orgs/${id}/members/${accountId}/profile`, token, patch)
  return json ?? { ok: false, error: 'Request failed.' }
}
export async function getPeopleMap(token: string, id: string): Promise<PeopleMap | null> {
  const { json } = await call<{ ok: boolean; map?: PeopleMap }>('GET', `/orgs/${id}/people-map`, token)
  return json?.map ?? null
}
