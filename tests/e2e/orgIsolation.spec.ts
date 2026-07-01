/**
 * Multi-org tenancy: the active organisation scopes the whole local workspace.
 * These tests assert the two properties that must hold or the feature is unsafe:
 *
 *  1. Data created before any switch lives in the reserved 'personal' org and is
 *     always visible there (the migration backfills existing rows to Personal, so
 *     nothing is lost).
 *  2. Switching org isolates data — one org never sees another org's rows, in
 *     either direction.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('OI-1 nodes are isolated per active org and Personal keeps its data', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // The default active org is Personal. Create a node here.
    const personalNodeId = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('personal')
      const n = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Personal Desk' })
      return n.id
    })

    // It is visible while Personal is active.
    const personalVisible = await window.evaluate(async (id: string) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const list = await api.nodes.list()
      return list.some((n) => n.id === id)
    }, personalNodeId)
    expect(personalVisible).toBe(true)

    // Switch to a different org. The Personal node must NOT be visible, and a
    // node created here belongs only to this org.
    const orgNodeId = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('org-test-alpha')
      const n = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Alpha Desk' })
      return n.id
    })

    const inAlpha = await window.evaluate(async (ids: { personal: string; org: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const list = await api.nodes.list()
      return {
        personalLeaked: list.some((n) => n.id === ids.personal),
        orgVisible: list.some((n) => n.id === ids.org),
        count: list.length
      }
    }, { personal: personalNodeId, org: orgNodeId })
    expect(inAlpha.personalLeaked).toBe(false) // no cross-org leak
    expect(inAlpha.orgVisible).toBe(true)

    // Switch back to Personal: the Personal node returns, the org node is hidden.
    const backHome = await window.evaluate(async (ids: { personal: string; org: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('personal')
      const list = await api.nodes.list()
      return {
        personalVisible: list.some((n) => n.id === ids.personal),
        orgLeaked: list.some((n) => n.id === ids.org)
      }
    }, { personal: personalNodeId, org: orgNodeId })
    expect(backHome.personalVisible).toBe(true)
    expect(backHome.orgLeaked).toBe(false)
  } finally {
    await dispose()
  }
})

test('OI-2 documents are isolated per active org', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const personalDocId = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('personal')
      const d = await api.documents.create({ docType: 'doc', title: 'Personal Doc' })
      return d.id
    })

    const isolated = await window.evaluate(async (id: string) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.session.setActiveOrg('org-test-beta')
      const inOrg = (await api.documents.list()).some((d) => d.id === id)
      await api.session.setActiveOrg('personal')
      const backHome = (await api.documents.list()).some((d) => d.id === id)
      return { inOrg, backHome }
    }, personalDocId)

    expect(isolated.inOrg).toBe(false) // personal doc not visible in another org
    expect(isolated.backHome).toBe(true) // returns when Personal is active again
  } finally {
    await dispose()
  }
})
