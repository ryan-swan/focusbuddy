// E2E for the configurable dashboard layout store (dashboard:getLayout /
// setLayout / resetLayout, backed by the dashboard_layouts table).
//
// Folder-desks are canvases now, so the old per-project dashboard UI that used
// to host this layout store is gone. The store itself is still real and drives
// the module dashboards (ModuleDashboard.tsx across Flow / Meet / Reports /
// Forms / Build), whose grid UI — the column chooser, per-card size control,
// and add / remove — is covered end to end by moduleDashboard.spec.ts.
//
// What these tests own is the persistence contract underneath that UI: a layout
// saved under a key round-trips across a full renderer reload, and each key is
// stored independently so one dashboard's layout never leaks into another's.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

test.setTimeout(90_000)

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('1. A column choice persists to the layout store across a reload', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Default has no stored layout for this key.
  const before = await window.evaluate(async () =>
    window.api.dashboard.getLayout('flow')
  )
  expect(before).toBeNull()

  // Save a 3-column layout under the key.
  await window.evaluate(async () => {
    await window.api.dashboard.setLayout('flow', {
      cardIds: ['workspace-progress', 'folders'],
      columns: 3
    })
  })

  // Reload the whole renderer — the 3-column choice must survive.
  await window.reload()
  await waitForReady(window)
  const after = await window.evaluate(async () =>
    window.api.dashboard.getLayout('flow')
  )
  expect(after?.columns).toBe(3)
  expect(after?.cardIds).toEqual(['workspace-progress', 'folders'])
})

test('2. A per-card size persists to the layout store across a reload', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await window.evaluate(async () => {
    await window.api.dashboard.setLayout('flow', {
      cardIds: ['workspace-progress'],
      columns: 3,
      sizes: { 'workspace-progress': 'small' }
    })
  })

  await window.reload()
  await waitForReady(window)
  const layout = await window.evaluate(async () =>
    window.api.dashboard.getLayout('flow')
  )
  expect(layout?.sizes?.['workspace-progress']).toBe('small')
})

test('3. Removing then re-adding a card round-trips through the store', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Start with two cards, then remove 'folders'.
  await window.evaluate(async () => {
    await window.api.dashboard.setLayout('flow', {
      cardIds: ['workspace-progress', 'folders'],
      columns: 2
    })
    await window.api.dashboard.setLayout('flow', {
      cardIds: ['workspace-progress'],
      columns: 2
    })
  })
  const removed = await window.evaluate(async () =>
    window.api.dashboard.getLayout('flow')
  )
  expect(removed?.cardIds).toEqual(['workspace-progress'])

  // Add it back — the store reflects the addition after a reload.
  await window.evaluate(async () => {
    await window.api.dashboard.setLayout('flow', {
      cardIds: ['workspace-progress', 'folders'],
      columns: 2
    })
  })
  await window.reload()
  await waitForReady(window)
  const readded = await window.evaluate(async () =>
    window.api.dashboard.getLayout('flow')
  )
  expect(readded?.cardIds).toEqual(['workspace-progress', 'folders'])
})

test('4. A stored layout under one key does not affect another key', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Save a 3-column layout under key A, leave key B and home untouched.
  await window.evaluate(async () => {
    await window.api.dashboard.setLayout('key-A', { cardIds: [], columns: 3 })
  })

  const aLayout = await window.evaluate(async () =>
    window.api.dashboard.getLayout('key-A')
  )
  expect(aLayout?.columns).toBe(3)

  // Key B was never written → no stored override.
  const bLayout = await window.evaluate(async () =>
    window.api.dashboard.getLayout('key-B')
  )
  expect(bLayout).toBeNull()

  // The home key is likewise its own bucket, unaffected by key A.
  const homeLayout = await window.evaluate(async () =>
    window.api.dashboard.getLayout('home')
  )
  expect(homeLayout).toBeNull()
})
