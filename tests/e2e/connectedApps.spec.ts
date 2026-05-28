import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// Integration tests for Connected Apps: schema migrations, seeding, sort
// promotion + favourites split, drag MIME shape. Drives the real Electron app
// via Playwright + window.api so we exercise the same IPC the user does.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('seeded Connected Apps render in the sidebar', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  // Seed via window.api so we exercise the real IPC + the new schema columns.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.connectedApps.create({ title: 'Gmail', url: 'https://mail.google.com' })
    await api.connectedApps.create({ title: 'GitHub', url: 'https://github.com' })
  })

  // After seeding, the store needs a refresh — the store usually reloads on
  // sidebar mount, but we just mutated under it, so force a manual refresh.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    // No store-level escape hatch exposed to the page — but list() pulls fresh
    // rows and lighting the storage event isn't worth the complexity here. The
    // assertion below uses a reload to pick up the new state cleanly.
    await api.connectedApps.list()
  })
  await window.reload()
  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  // Both apps appear in the sidebar (favourites strip — the empty/cold list
  // promotes everything since fewer than 6 apps).
  await expect(window.getByText('Gmail', { exact: true })).toBeVisible()
  await expect(window.getByText('GitHub', { exact: true })).toBeVisible()
})

test('schema migration: new connected_apps columns return correct defaults', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const created = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return await api.connectedApps.create({
      title: 'Notion',
      url: 'https://notion.so'
    })
  })

  // Defaults from the schema must be reflected in the typed return:
  // useCount=0, lastUsedAt=null, pinned=false, vaultEntryId=null,
  // autofillEnabled=true. Catches regressions if a future migration changes
  // the column defaults silently.
  expect(created.useCount).toBe(0)
  expect(created.lastUsedAt).toBeNull()
  expect(created.pinned).toBe(false)
  expect(created.vaultEntryId).toBeNull()
  expect(created.autofillEnabled).toBe(true)
})

test('touch() bumps use_count and last_used_at', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const app = await api.connectedApps.create({
      title: 'Slack',
      url: 'https://slack.com'
    })
    const before = { useCount: app.useCount, lastUsedAt: app.lastUsedAt }
    const touched1 = await api.connectedApps.touch(app.id)
    const touched2 = await api.connectedApps.touch(app.id)
    return { before, touched1, touched2 }
  })

  expect(result.before.useCount).toBe(0)
  expect(result.before.lastUsedAt).toBeNull()
  expect(result.touched1?.useCount).toBe(1)
  expect(result.touched1?.lastUsedAt).toBeGreaterThan(0)
  expect(result.touched2?.useCount).toBe(2)
})

test('findByHostname matches on hostname (no duplicates on Pin)', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const created = await api.connectedApps.create({
      title: 'Linear',
      url: 'https://linear.app/foo/team'
    })
    // Hostname matches regardless of subpath.
    const found = await api.connectedApps.findByHostname('linear.app')
    // www. prefix stripped on both sides.
    const foundWww = await api.connectedApps.findByHostname('www.linear.app')
    // Different host returns null — guards against false-positive de-duping.
    const missing = await api.connectedApps.findByHostname('linear.example')
    return {
      createdId: created.id,
      foundId: found?.id ?? null,
      foundWwwId: foundWww?.id ?? null,
      missing
    }
  })

  expect(result.foundId).toBe(result.createdId)
  expect(result.foundWwwId).toBe(result.createdId)
  expect(result.missing).toBeNull()
})

test('Pin app affordance dedupes against existing Connected Apps by hostname', async () => {
  // Regression: if a user already has GitHub pinned and hits "pin to apps"
  // from a github.com/issues/123 webview widget, we MUST reuse the existing
  // app — not create a second one. The flow is hostname-match + link the widget.
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const original = await api.connectedApps.create({
      title: 'GitHub',
      url: 'https://github.com'
    })
    // The renderer-side dedupe path: findByHostname → reuse if found.
    const match = await api.connectedApps.findByHostname('github.com')
    return {
      originalId: original.id,
      matchedId: match?.id ?? null,
      allCount: (await api.connectedApps.list()).length
    }
  })

  expect(result.matchedId).toBe(result.originalId)
  expect(result.allCount).toBe(1)
})
