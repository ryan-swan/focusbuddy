// Unit tests for the preview-build sync safety guard
// (src/renderer/src/lib/previewGuard.ts).
//
// The guard's whole contract is one boolean: block workspace/cloud-docs sync
// when BOTH (a) this binary self-reports as the side-by-side preview build
// via window.api.app.isPreviewBuild(), AND (b) the configured signal host is
// the production host. Any other combination must NOT block.
//
// previewGuard.ts keeps `resolved`/`blocked` as module-level state and only
// resolves once (`if (resolved) return`), so each case needs a fresh module
// instance — vi.resetModules() + a dynamic re-import per test, with
// lib/signalConfig mocked to control httpUrl without needing a real build.

import { describe, it, expect, beforeEach, vi } from 'vitest'

async function loadGuard(opts: { preview: boolean; httpUrl: string }): Promise<{
  initPreviewGuard: () => void
  previewSyncBlocked: () => boolean
}> {
  vi.resetModules()
  vi.doMock('../../src/renderer/src/lib/signalConfig', () => ({
    signalConfig: { useRemote: true, httpUrl: opts.httpUrl, wsUrl: 'ws://irrelevant' }
  }))
  ;(window as unknown as { api: unknown }).api = {
    app: { isPreviewBuild: () => Promise.resolve(opts.preview) }
  }
  return import('../../src/renderer/src/lib/previewGuard')
}

describe('previewGuard', () => {
  beforeEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('blocks sync when the build is preview AND the host is production', async () => {
    const { initPreviewGuard, previewSyncBlocked } = await loadGuard({
      preview: true,
      httpUrl: 'https://focusbuddy-signal.fly.dev'
    })
    expect(previewSyncBlocked()).toBe(false) // not resolved yet
    initPreviewGuard()
    await vi.waitFor(() => expect(previewSyncBlocked()).toBe(true))
  })

  it('does NOT block when the build is preview but the host is a local/test server', async () => {
    const { initPreviewGuard, previewSyncBlocked } = await loadGuard({
      preview: true,
      httpUrl: 'http://localhost:8790'
    })
    initPreviewGuard()
    // Flush the isPreviewBuild() promise, then assert it settled to unblocked.
    await Promise.resolve()
    await Promise.resolve()
    expect(previewSyncBlocked()).toBe(false)
  })

  it('does NOT block when the host is production but the build is NOT preview', async () => {
    const { initPreviewGuard, previewSyncBlocked } = await loadGuard({
      preview: false,
      httpUrl: 'https://focusbuddy-signal.fly.dev'
    })
    initPreviewGuard()
    await Promise.resolve()
    await Promise.resolve()
    expect(previewSyncBlocked()).toBe(false)
  })

  it('is idempotent — calling initPreviewGuard twice only resolves once and keeps the blocked verdict', async () => {
    const { initPreviewGuard, previewSyncBlocked } = await loadGuard({
      preview: true,
      httpUrl: 'https://focusbuddy-signal.fly.dev'
    })
    initPreviewGuard()
    await vi.waitFor(() => expect(previewSyncBlocked()).toBe(true))
    initPreviewGuard() // no-op per the `resolved` guard
    expect(previewSyncBlocked()).toBe(true)
  })
})
