/**
 * Crash telemetry (WS03): a render-side error is forwarded over IPC, persisted in
 * the main-process crash log with the app version, and readable back. Exercises
 * the real chain (preload bridge → crash:report IPC → SQLite → crash:list) rather
 * than a mock. Triggering a genuine uncaught crash in the harness is unreliable,
 * so this drives the same reportCrash path the boundaries + window handlers use.
 */
import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

test.describe('crash telemetry', () => {
  let app: LaunchedApp
  let window: Page
  test.beforeAll(async () => { app = await launchApp(); window = app.window; await waitForReady(window) })
  test.afterAll(async () => { await app.dispose() })

  test('a reported render error is persisted and read back with app version', async () => {
    const marker = 'e2e-crash-' + Date.now()
    await window.evaluate(async (msg) => {
      // @ts-expect-error preload bridge
      await window.api.crash.report({ kind: 'test-crash', message: msg, stack: 'at test (x:1)', context: 'crashTelemetry.spec' })
    }, marker)

    const found = await window.evaluate(async (msg) => {
      // @ts-expect-error preload bridge
      const list = await window.api.crash.list(50)
      return list.find((c: { message: string }) => c.message === msg) ?? null
    }, marker)

    expect(found).not.toBeNull()
    expect(found.source).toBe('renderer')
    expect(found.kind).toBe('test-crash')
    expect(found.componentStack).toBeNull()
    expect(typeof found.appVersion).toBe('string')
    expect(found.appVersion.length).toBeGreaterThan(0)
    expect(typeof found.ts).toBe('number')
  })

  test('crashList returns most-recent-first', async () => {
    const a = 'order-a-' + Date.now()
    const b = 'order-b-' + Date.now()
    await window.evaluate(async ({ a, b }) => {
      // @ts-expect-error preload bridge
      await window.api.crash.report({ kind: 'order', message: a })
      // @ts-expect-error preload bridge
      await window.api.crash.report({ kind: 'order', message: b })
    }, { a, b })
    const order = await window.evaluate(async ({ a, b }) => {
      // @ts-expect-error preload bridge
      const list = await window.api.crash.list(50)
      const ia = list.findIndex((c: { message: string }) => c.message === a)
      const ib = list.findIndex((c: { message: string }) => c.message === b)
      return { ia, ib }
    }, { a, b })
    // b reported after a → b appears earlier (smaller index) in the recent-first list.
    expect(order.ib).toBeGreaterThanOrEqual(0)
    expect(order.ib).toBeLessThan(order.ia)
  })
  test('unforwarded lists a new crash and markForwarded clears it', async () => {
    const marker = 'fwd-' + Date.now()
    const id = await window.evaluate(async (msg) => {
      // @ts-expect-error preload bridge
      await window.api.crash.report({ kind: 'fwd-test', message: msg })
      // @ts-expect-error preload bridge
      const un = await window.api.crash.unforwarded(50)
      return (un.find((c: { message: string }) => c.message === msg) ?? {}).id ?? null
    }, marker)
    expect(id).not.toBeNull()

    const clearedOut = await window.evaluate(async ({ id, msg }) => {
      // @ts-expect-error preload bridge
      await window.api.crash.markForwarded([id])
      // @ts-expect-error preload bridge
      const un = await window.api.crash.unforwarded(50)
      return un.some((c: { message: string }) => c.message === msg)
    }, { id, msg: marker })
    // After marking forwarded, it no longer appears in the unforwarded queue.
    expect(clearedOut).toBe(false)

    // ...but it is still in the full crash log (forwarded, not deleted).
    const stillLogged = await window.evaluate(async (msg) => {
      // @ts-expect-error preload bridge
      const list = await window.api.crash.list(50)
      return list.some((c: { message: string }) => c.message === msg)
    }, marker)
    expect(stillLogged).toBe(true)
  })
})
