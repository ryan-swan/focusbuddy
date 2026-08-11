import { create } from 'zustand'
import { useAccountStore } from './account'
import { useOrgStore, PERSONAL_ORG_ID } from './org'
import { useCapabilityStore } from './capabilities'
import { getAccountState, setAccountState } from '../lib/accountStateClient'
import { getOrgState, setOrgState } from '../lib/orgStateClient'
import {
  resolveAutonomy,
  type AutonomyLevel,
  type AutonomyPolicy,
  type ResolvedAutonomy
} from '../lib/autonomyPolicy'

// The client home of the three-level autonomy policy. The user's system-wide and
// per-assistant choices live in per-account synced state (consistent across their
// devices); the org ceiling/default lives in per-org synced state that only an
// admin can write. This store loads all three, exposes setters that persist to the
// right place, and resolves the effective level through the pure resolver. Honest
// by construction: if the org has set no policy, orgPolicyPresent is false and we
// say so rather than inventing a cap.

const KEY = 'autonomy'

interface AccountAutonomy {
  systemChoice?: AutonomyLevel
  assistantChoices?: Record<string, AutonomyLevel | undefined>
}
export interface OrgAutonomy {
  ceiling?: AutonomyLevel
  default?: AutonomyLevel
}

interface AutonomyStore {
  loaded: boolean
  systemChoice?: AutonomyLevel
  assistantChoices: Record<string, AutonomyLevel | undefined>
  orgCeiling?: AutonomyLevel
  orgDefault?: AutonomyLevel
  // Did the org actually set a policy? Distinguishes "no cap" from "not configured".
  orgPolicyPresent: boolean
  // Is the active-org role admin/owner (may edit the org policy)?
  canEditOrg: boolean
  inSharedOrg: boolean
  load: () => Promise<void>
  setSystemChoice: (level: AutonomyLevel | undefined) => Promise<void>
  setAssistantChoice: (assistantId: string, level: AutonomyLevel | undefined) => Promise<void>
  setOrgPolicy: (policy: OrgAutonomy) => Promise<{ ok: boolean; forbidden?: boolean }>
  policy: () => AutonomyPolicy
  resolveFor: (assistantId?: string) => ResolvedAutonomy
}

export const useAutonomyStore = create<AutonomyStore>((set, get) => ({
  loaded: false,
  systemChoice: undefined,
  assistantChoices: {},
  orgCeiling: undefined,
  orgDefault: undefined,
  orgPolicyPresent: false,
  canEditOrg: false,
  inSharedOrg: false,

  load: async () => {
    const token = useAccountStore.getState().sessionToken
    if (!token) {
      set({ loaded: true })
      return
    }
    const activeOrgId = useOrgStore.getState().activeOrgId
    const orgs = useOrgStore.getState().orgs
    const inSharedOrg =
      activeOrgId !== PERSONAL_ORG_ID && orgs.some((o) => o.id === activeOrgId && !o.personal)
    const orgRole = useCapabilityStore.getState().orgRole
    const canEditOrg = orgRole === 'owner' || orgRole === 'admin'

    const acct = await getAccountState<AccountAutonomy>(token, KEY)
    const org = inSharedOrg ? await getOrgState<OrgAutonomy>(token, activeOrgId, KEY) : null
    const orgPolicyPresent = !!(org && (org.ceiling || org.default))

    set({
      loaded: true,
      systemChoice: acct?.systemChoice,
      assistantChoices: acct?.assistantChoices ?? {},
      orgCeiling: org?.ceiling,
      orgDefault: org?.default,
      orgPolicyPresent,
      canEditOrg,
      inSharedOrg
    })
  },

  setSystemChoice: async (level) => {
    set({ systemChoice: level })
    const token = useAccountStore.getState().sessionToken
    if (token) {
      const payload: AccountAutonomy = { systemChoice: level, assistantChoices: get().assistantChoices }
      void setAccountState(token, KEY, payload)
    }
  },

  setAssistantChoice: async (assistantId, level) => {
    const next = { ...get().assistantChoices, [assistantId]: level }
    if (level === undefined) delete next[assistantId]
    set({ assistantChoices: next })
    const token = useAccountStore.getState().sessionToken
    if (token) {
      const payload: AccountAutonomy = { systemChoice: get().systemChoice, assistantChoices: next }
      void setAccountState(token, KEY, payload)
    }
  },

  setOrgPolicy: async (policy) => {
    const token = useAccountStore.getState().sessionToken
    const activeOrgId = useOrgStore.getState().activeOrgId
    if (!token || activeOrgId === PERSONAL_ORG_ID) return { ok: false }
    const res = await setOrgState(token, activeOrgId, KEY, policy)
    if (res.ok) {
      set({
        orgCeiling: policy.ceiling,
        orgDefault: policy.default,
        orgPolicyPresent: !!(policy.ceiling || policy.default)
      })
    }
    return res
  },

  policy: () => {
    const s = get()
    return {
      orgCeiling: s.orgCeiling,
      orgDefault: s.orgDefault,
      systemChoice: s.systemChoice,
      assistantChoices: s.assistantChoices
    }
  },

  resolveFor: (assistantId) => resolveAutonomy(get().policy(), assistantId)
}))
