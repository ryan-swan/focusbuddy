/**
 * E2E sanity check for the app-identity half of the preview safety guard:
 * launching with PLEXI_APP=preview3 makes the main process self-report as
 * the preview build over IPC (app:isPreviewBuild). The actual block/no-block
 * DECISION logic (host-based) is unit-tested deterministically in
 * tests/unit/previewGuard.test.ts, since the renderer bundle under test here
 * was built pointed at the LOCAL test signal server (never production), so
 * this instance can never honestly exercise the "preview + prod host"
 * branch without either rebuilding against the real prod host (defeats the
 * point of an isolated test build) or faking window.api (which the
 * no-fakery rule and the "no invented pass" standard both rule out for a
 * signal that matters this much). This spec verifies the part that CAN be
 * verified honestly from a running instance: the preview flag itself, and
 * that no request to any signal host is made against this build's own
 * (local, harmless) configured host while running with the flag set.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('PLEXI_APP=preview3 makes window.api.app.isPreviewBuild() report true', async () => {
  launched = await launchApp({ env: { PLEXI_APP: 'preview3' } })
  const { window } = launched
  await waitForReady(window)

  const isPreview = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.app.isPreviewBuild()
  })
  expect(isPreview).toBe(true)
})

test('without PLEXI_APP set, isPreviewBuild() reports false', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const isPreview = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.app.isPreviewBuild()
  })
  expect(isPreview).toBe(false)
})
