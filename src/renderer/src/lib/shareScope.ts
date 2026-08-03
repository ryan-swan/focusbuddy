import { confirmDialog, promptChoice } from '../components/plexi/PromptDialog'
import { listTeamsForOrg, createTeamForOrg, addTeamMemberForOrg } from './teamsClient'
import { getOrg, type OrgMember } from './orgsClient'
import { useAccountStore } from '../stores/account'

// Shared "Share with team / group" flow used by the Desks, Rooms and Files views.
// Picks the target org (when the account belongs to more than one), then lets the
// user choose the audience: everyone in the org, one of their groups, or a specific
// person (a private share). Group and person shares are both leak-free because they
// re-scope the object to a team; the person case reuses a small ad-hoc group of just
// the two people. Whole-org and group shares spell out who gets access before
// anything moves. `move(orgId, teamId)` does the actual re-scope (teamId null = whole
// org). No-op if the account has no org to share into.

export interface ShareOrgOption {
  id: string
  name: string
}

// A person's display name for the picker: real name if we have it, else @handle.
function personLabel(m: OrgMember): string {
  const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
  return name || `@${m.handle}`
}

// Deterministic name for the ad-hoc "just these two people" group behind a private
// share, so re-sharing another object to the same person reuses the same group
// rather than spawning a new one each time. Handles are sorted so both directions
// resolve to the same name within one owner's team list.
function directGroupName(a: string, b: string): string {
  const [x, y] = [a, b].sort()
  return `Direct · @${x} ↔ @${y}`
}

export async function shareToOrgOrGroup(opts: {
  name: string
  kindLabel: string
  sharedOrgs: ShareOrgOption[]
  move: (orgId: string, teamId: string | null) => Promise<unknown> | unknown
}): Promise<void> {
  const orgs = opts.sharedOrgs
  if (!orgs.length) return

  // Choose the org (skip the step when there's only one).
  let org = orgs[0]
  if (orgs.length > 1) {
    const chosen = await promptChoice({
      title: `Share “${opts.name}” with…`,
      body: 'Choose an organisation.',
      choices: orgs.map((o) => ({ label: o.name, value: o.id }))
    })
    if (!chosen) return
    org = orgs.find((o) => o.id === chosen) ?? org
  }

  const token = useAccountStore.getState().sessionToken
  const teams = token ? await listTeamsForOrg(token, org.id) : []

  // The audience picker: everyone in the org, any of the user's groups, or one
  // specific person. Groups and the specific-person case both re-scope to a team,
  // so only the chosen people ever sync the object.
  const choice = await promptChoice({
    title: `Share “${opts.name}”`,
    body: `Who in ${org.name} should get this ${opts.kindLabel}?`,
    choices: [
      { label: `Everyone in ${org.name}`, value: '__org__', hint: 'All members of the organisation' },
      ...teams.map((t) => ({
        label: t.name,
        value: t.id,
        hint: `Group · only its ${t.memberCount} member${t.memberCount === 1 ? '' : 's'} will see it`
      })),
      { label: 'Specific person…', value: '__person__', hint: 'Share privately with one person you choose' }
    ]
  })
  if (!choice) return

  if (choice === '__org__') {
    const ok = await confirmDialog({
      title: `Share “${opts.name}” with ${org.name}?`,
      body: `Everyone in ${org.name} will be able to see and edit this ${opts.kindLabel}. It moves out of your Personal workspace.`,
      confirmLabel: 'Share with team'
    })
    if (ok) await opts.move(org.id, null)
    return
  }

  if (choice === '__person__') {
    await shareWithPerson({ ...opts, org, token })
    return
  }

  // A group: only its members will see it.
  await opts.move(org.id, choice)
}

// Private share to one person. Picks a member of the target org, then find-or-creates
// a small ad-hoc group of just {me, them} and scopes the object to it. That reuses the
// proven team-isolation path, so nobody outside the pair ever syncs the object. All
// team calls carry an explicit target-org header so the handle resolves and the group
// lands in the right org even while the active workspace is Personal.
async function shareWithPerson(opts: {
  name: string
  kindLabel: string
  org: ShareOrgOption
  token: string | null
  move: (orgId: string, teamId: string | null) => Promise<unknown> | unknown
}): Promise<void> {
  const { token, org } = opts
  if (!token) return

  const me = useAccountStore.getState().account
  const detail = await getOrg(token, org.id)
  const members = detail?.members ?? []
  const others = members.filter((m) => m.accountId !== me?.id && !!m.handle)

  if (!others.length) {
    await confirmDialog({
      title: 'No one to share with yet',
      body: `You're the only member of ${org.name} right now. Invite people to the organisation first, then you can share privately with them.`,
      confirmLabel: 'OK'
    })
    return
  }

  const pickedHandle = await promptChoice({
    title: `Share “${opts.name}” privately`,
    body: `Only this person and you will be able to see and edit this ${opts.kindLabel}.`,
    choices: others.map((m) => ({ label: personLabel(m), value: m.handle, hint: `@${m.handle}` }))
  })
  if (!pickedHandle) return

  const myHandle = me?.handle
  if (!myHandle) return

  // Find-or-create the {me, them} group in this org.
  const groupName = directGroupName(myHandle, pickedHandle)
  const existing = (await listTeamsForOrg(token, org.id)).find((t) => t.name === groupName)
  let teamId = existing?.id ?? null
  if (!teamId) {
    const created = await createTeamForOrg(token, groupName, org.id)
    teamId = created?.id ?? null
  }
  if (!teamId) {
    await confirmDialog({
      title: 'Could not create the private group',
      body: 'The private share group could not be created. Please try again.',
      confirmLabel: 'OK'
    })
    return
  }

  // Ensure the other person is a member (I'm already the owner). Idempotent server-side.
  await addTeamMemberForOrg(token, teamId, pickedHandle, org.id)

  await opts.move(org.id, teamId)
}
