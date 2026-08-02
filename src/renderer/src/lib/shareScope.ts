import { confirmDialog, promptChoice } from '../components/plexi/PromptDialog'
import { listTeamsForOrg } from './teamsClient'
import { useAccountStore } from '../stores/account'

// Shared "Share with team / group" flow used by the Desks, Rooms and Files views.
// Picks the target org (when the account belongs to more than one), then — if that
// org has groups the account is in — lets them narrow the share to one group, so
// only that group's members see it. Whole-org and group shares both spell out who
// gets access before anything moves. `move(orgId, teamId)` does the actual re-scope
// (teamId null = whole org). No-op if the account has no org to share into.

export interface ShareOrgOption {
  id: string
  name: string
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

  if (!teams.length) {
    // No groups to narrow to — a plain whole-org share with a clear audience note.
    const ok = await confirmDialog({
      title: `Share “${opts.name}” with ${org.name}?`,
      body: `Everyone in ${org.name} will be able to see and edit this ${opts.kindLabel}. It moves out of your Personal workspace.`,
      confirmLabel: 'Share with team'
    })
    if (ok) await opts.move(org.id, null)
    return
  }

  // Groups exist: whole org, or a single group whose members are the only ones who
  // will see it.
  const choice = await promptChoice({
    title: `Share “${opts.name}”`,
    body: `Who in ${org.name} should get this ${opts.kindLabel}?`,
    choices: [
      { label: `Everyone in ${org.name}`, value: '__org__', hint: 'All members of the organisation' },
      ...teams.map((t) => ({
        label: t.name,
        value: t.id,
        hint: `Group · only its ${t.memberCount} member${t.memberCount === 1 ? '' : 's'} will see it`
      }))
    ]
  })
  if (!choice) return
  await opts.move(org.id, choice === '__org__' ? null : choice)
}
