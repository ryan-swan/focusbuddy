import { create } from 'zustand'
import { listOrgs, type OrgMembership } from '../lib/orgsClient'
import { useAccountStore } from './account'
import { useNodeStore } from './nodes'
import { useDocumentsStore } from './documents'
import { useConnectedAppsStore } from './connectedApps'
import { useFileManagerStore } from './fileManager'
import { useMailStore } from './mail'
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
    // Entitlements resolve against the active org, so re-fetch them on switch:
    // an app the new org is not licensed for greys out (or an app the previous
    // org restricted comes back). Lazy import avoids a store import cycle.
    void import('./capabilities').then((m) => m.useCapabilityStore.getState().refresh())
    // Reload every org-scoped surface so the whole workspace reflects the new
    // org. Files are listed per-view, so resetting the view forces those to
    // re-query under the new org too.
    await Promise.allSettled([
      useNodeStore.getState().refresh(),
      useDocumentsStore.getState().refresh(),
      useConnectedAppsStore.getState().refresh(),
      // The file manager caches its entries independent of the view, so it must
      // be reloaded explicitly or it would keep showing the previous org's files.
      useFileManagerStore.getState().refresh(),
      // Mail is per-org on this device (each org has its own mailbox), so reload
      // the active org's account + envelopes on switch.
      useMailStore.getState().loadAccount()
    ])
    useNodeStore.getState().setActive(null)
    // Resetting the view re-mounts the per-view surfaces (calendar, vault,
    // knowledge, tables), so they re-query under the new active org.
    useViewStore.getState().goHome()
  }
}))

// Thin handle for debugging + e2e (same convention as __fbNodes / __fbWidgets /
// __fbView): lets a test read/drive the active org — the two-account org
// convergence spec asserts activeOrgId adoption on both windows before checking
// cross-account sync, so a setup failure fails fast instead of looking like a
// convergence timeout.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbOrg?: typeof useOrgStore }).__fbOrg = useOrgStore
}
