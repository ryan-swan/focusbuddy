import { create } from 'zustand'
import { listOrgs, type OrgMembership } from '../lib/orgsClient'
import { useAccountStore } from './account'
import { useNodeStore } from './nodes'
import { useDocumentsStore } from './documents'
import { useConnectedAppsStore } from './connectedApps'
import { useViewStore } from './view'

// The active organisation is the tenancy boundary for the whole workspace. The
// user's own local-first data lives in a reserved "Personal" org that is always
// available offline; the other options are the real server orgs the account has
// been invited to. Switching reloads every org-scoped surface so the app shows
// only the active org's files, docs, tasks and apps.
export const PERSONAL_ORG_ID = 'personal'

export interface OrgOption {
  id: string
  name: string
  personal: boolean
  role?: string
}

const PERSONAL_OPTION: OrgOption = { id: PERSONAL_ORG_ID, name: 'Personal', personal: true }

interface OrgStore {
  activeOrgId: string
  orgs: OrgOption[]
  loaded: boolean
  load: () => Promise<void>
  setActive: (orgId: string) => Promise<void>
}

export const useOrgStore = create<OrgStore>((set, get) => ({
  activeOrgId: PERSONAL_ORG_ID,
  orgs: [PERSONAL_OPTION],
  loaded: false,

  load: async () => {
    // The persisted active org lives in main so the choice survives a restart.
    let active = PERSONAL_ORG_ID
    try {
      active = await window.api.session.getActiveOrg()
    } catch {
      /* offline / not yet migrated → Personal */
    }

    // Server orgs only exist when signed in. Personal is always present locally.
    // The server also keeps a per-account personal org; we represent Personal
    // ourselves, so its server twin is filtered out to avoid a duplicate row.
    const token = useAccountStore.getState().sessionToken
    let serverOrgs: OrgMembership[] = []
    if (token) {
      try {
        serverOrgs = await listOrgs(token)
      } catch {
        /* keep Personal-only on a failed fetch, never invent orgs */
      }
    }
    const options: OrgOption[] = [
      PERSONAL_OPTION,
      ...serverOrgs
        .filter((o) => !o.personal)
        .map((o) => ({ id: o.id, name: o.name, personal: false, role: o.role }))
    ]

    // If the persisted org is no longer one the account belongs to (removed, or
    // signed out), fall back to Personal and persist that correction.
    const activeValid = options.some((o) => o.id === active)
    const resolved = activeValid ? active : PERSONAL_ORG_ID
    if (!activeValid && active !== PERSONAL_ORG_ID) {
      try {
        await window.api.session.setActiveOrg(PERSONAL_ORG_ID)
      } catch {
        /* ignore */
      }
    }
    set({ orgs: options, activeOrgId: resolved, loaded: true })
  },

  setActive: async (orgId) => {
    if (orgId === get().activeOrgId) return
    try {
      await window.api.session.setActiveOrg(orgId)
    } catch {
      return
    }
    set({ activeOrgId: orgId })
    // Reload every org-scoped surface so the whole workspace reflects the new
    // org. Files are listed per-view, so resetting the view forces those to
    // re-query under the new org too.
    await Promise.allSettled([
      useNodeStore.getState().refresh(),
      useDocumentsStore.getState().refresh(),
      useConnectedAppsStore.getState().refresh()
    ])
    useNodeStore.getState().setActive(null)
    useViewStore.getState().goHome()
  }
}))
