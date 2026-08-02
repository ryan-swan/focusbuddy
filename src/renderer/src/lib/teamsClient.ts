import { signalConfig } from './signalConfig'

// HTTP client for teams (signal server /teams). A team is a named group of
// accounts you can share or invite to. Mirrors docCollabClient's call helper.

export interface Team {
  id: string
  name: string
  ownerAccountId: string
  createdAt: number
  memberCount: number
  role: string
}

export interface TeamMember {
  accountId: string
  handle: string | null
  firstName?: string | null
  lastName?: string | null
  role: string
  addedAt: number
}

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

async function call<T>(
  method: 'GET' | 'POST' | 'DELETE',
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

export async function listTeams(token: string): Promise<Team[]> {
  const { json } = await call<{ ok: boolean; teams?: Team[] }>('GET', '/teams', token)
  return json?.teams ?? []
}

// The teams the account belongs to in a SPECIFIC org — used by the share-scope
// picker, which needs the target org's groups even while the active org is
// Personal. Sets x-plexi-org explicitly (the interceptor now respects it, and the
// server re-validates membership). Returns [] on any error.
export async function listTeamsForOrg(token: string, orgId: string): Promise<Team[]> {
  try {
    const res = await fetch(urlFor('/teams'), {
      headers: { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId }
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; teams?: Team[] } | null
    return json?.teams ?? []
  } catch {
    return []
  }
}

export async function createTeam(token: string, name: string): Promise<Team | null> {
  const { json } = await call<{ ok: boolean; team?: Team }>('POST', '/teams', token, { name })
  return json?.team ?? null
}

export async function listTeamMembers(token: string, teamId: string): Promise<TeamMember[]> {
  const { json } = await call<{ ok: boolean; members?: TeamMember[] }>('GET', `/teams/${teamId}/members`, token)
  return json?.members ?? []
}

export async function addTeamMember(
  token: string,
  teamId: string,
  handle: string
): Promise<{ ok: boolean; member?: TeamMember; error?: string }> {
  const { ok, json } = await call<{ ok: boolean; member?: TeamMember; error?: string }>(
    'POST',
    `/teams/${teamId}/members`,
    token,
    { handle }
  )
  return { ok: ok && !!json?.ok, member: json?.member, error: json?.error }
}

export async function removeTeamMember(token: string, teamId: string, accountId: string): Promise<boolean> {
  const { ok, json } = await call<{ ok: boolean }>('DELETE', `/teams/${teamId}/members/${accountId}`, token)
  return ok && !!json?.ok
}

// Invite an entire team to a live document (doc owner only): every member becomes
// an editor.
export async function inviteTeamToDoc(
  token: string,
  liveDocId: string,
  teamId: string
): Promise<{ ok: boolean; invited?: number; error?: string }> {
  const { ok, json } = await call<{ ok: boolean; invited?: number; error?: string }>(
    'POST',
    `/livedocs/${liveDocId}/invite-team`,
    token,
    { teamId }
  )
  return { ok: ok && !!json?.ok, invited: json?.invited, error: json?.error }
}
