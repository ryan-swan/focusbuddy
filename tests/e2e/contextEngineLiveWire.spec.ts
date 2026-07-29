import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Verifies the Context Engine live wire (src/main/context/engine.ts,
// src/main/ipc/index.ts nodes:* handlers) is additive and defensive: desk/task
// create, update, delete, relate/unrelate must keep working exactly as before,
// with no thrown errors and no console noise from the context engine, even
// though every one of those handlers now also emits an Event / mirrors a
// Relationship into the new stores. Driven through window.api.nodes (the same
// IPC surface the renderer UI calls), which is legitimate per the tester's own
// guidance: exercise the contract via the exposed API when a raw UI gesture
// adds nothing.

test('CONTEXT-ENGINE — node CRUD + relate/unrelate keep working with the live wire attached', async () => {
  const { app, window, dispose } = await launchApp()
  const consoleErrors: string[] = []
  const consoleWarnings: string[] = []
  const pageErrors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
    if (msg.type() === 'warning') consoleWarnings.push(msg.text())
  })
  window.on('pageerror', (err) => pageErrors.push(err.message))
  let mainStderr = ''
  app.process().stderr?.on('data', (b) => {
    mainStderr += b.toString()
  })

  try {
    await waitForReady(window)

    const r = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      type N = {
        id: string
        title: string
        status: string
        importance: number
        parentId: string | null
      }

      // ── create ──────────────────────────────────────────────────────────
      const a = (await api.nodes.create({ parentId: null, kind: 'task', title: 'Ctx Desk A' })) as N
      const b = (await api.nodes.create({ parentId: null, kind: 'task', title: 'Ctx Desk B' })) as N
      const listAfterCreate = (await api.nodes.list()) as N[]

      // ── update: rename, importance, status ─────────────────────────────
      const renamed = (await api.nodes.update(a.id, { title: 'Ctx Desk A Renamed' })) as N
      const reimportanced = (await api.nodes.update(a.id, { importance: 5 })) as N
      const completed = (await api.nodes.update(a.id, { status: 'done' })) as N

      // ── relate / unrelate ───────────────────────────────────────────────
      const relatedAfterRelate = (await api.nodes.relate(a.id, b.id)) as string[]
      const listRelatedA = (await api.nodes.listRelated(a.id)) as string[]
      const relatedAfterUnrelate = (await api.nodes.unrelate(a.id, b.id)) as string[]

      // ── delete ──────────────────────────────────────────────────────────
      const trashed = (await api.nodes.delete(b.id)) as string[]
      const listAfterDelete = (await api.nodes.list()) as N[]

      return {
        aId: a.id,
        bId: b.id,
        createdBothPresent: listAfterCreate.some((n) => n.id === a.id) && listAfterCreate.some((n) => n.id === b.id),
        renamedTitle: renamed?.title,
        reimportancedValue: reimportanced?.importance,
        completedStatus: completed?.status,
        relatedAfterRelate,
        listRelatedA,
        relatedAfterUnrelate,
        trashed,
        bGoneAfterDelete: !listAfterDelete.some((n) => n.id === b.id)
      }
    })

    expect(r.createdBothPresent).toBe(true)
    expect(r.renamedTitle).toBe('Ctx Desk A Renamed')
    expect(r.reimportancedValue).toBe(5)
    expect(r.completedStatus).toBe('done')
    expect(r.relatedAfterRelate).toContain(r.bId)
    expect(r.listRelatedA).toContain(r.bId)
    expect(r.relatedAfterUnrelate).not.toContain(r.bId)
    expect(r.trashed).toContain(r.bId)
    expect(r.bGoneAfterDelete).toBe(true)

    // No renderer console errors, no uncaught page errors. A generic
    // "Failed to load resource: 404" pre-exists on a bare boot with zero
    // node/context interaction (verified separately) — it fires before any
    // of this test's IPC calls, so it is baseline app noise, not something
    // this diff introduced. Filtered out here; anything else still fails.
    expect(pageErrors, `pageerror events: ${JSON.stringify(pageErrors)}`).toEqual([])
    const unexpectedConsoleErrors = consoleErrors.filter(
      (e) => !e.includes('Failed to load resource: the server responded with a status of 404')
    )
    expect(unexpectedConsoleErrors, `console.error messages: ${JSON.stringify(unexpectedConsoleErrors)}`).toEqual([])

    // No context-engine warnings either — the engine should succeed silently
    // on a healthy DB, not merely "fail without throwing".
    const ctxWarnings = consoleWarnings.filter((w) => w.includes('[context-engine]'))
    expect(ctxWarnings, `context-engine warnings: ${JSON.stringify(ctxWarnings)}`).toEqual([])
    const ctxStderr = mainStderr.includes('[context-engine]')
    expect(ctxStderr, `main-process stderr contained a context-engine warning:\n${mainStderr}`).toBe(false)
  } finally {
    await dispose()
  }
})

// Secondary check: the new context:* read handlers (context:related,
// context:health, context:markReviewed) are registered on ipcMain but are not
// yet exposed on window.api — no renderer surface calls them (per the
// engine.ts commit message, "rewiring [the renderer] is the next UI
// increment"). Confirmed below: window.api has no `context` namespace. Since
// there's no UI or window.api path to drive them, and adding one would mean
// editing preload/production code (outside this tester's remit), this test
// instead invokes the registered ipcMain handlers directly from the main
// process via Electron's internal `ipcMain._invokeHandlers` map — the same
// function objects that would run if a renderer called ipcRenderer.invoke.
// That is API-driven-via-reflection, not UI-driven; flagged here explicitly.
test('CONTEXT-ENGINE — context:* handlers respond without error (reflection-invoked, no window.api surface yet)', async () => {
  const { app, window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const hasContextNamespace = await window.evaluate(() => {
      const api = (window as unknown as { api: Record<string, unknown> }).api
      return typeof api.context === 'object' && api.context !== null
    })
    expect(hasContextNamespace).toBe(false)

    const { aId, bId } = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      type N = { id: string }
      const a = (await api.nodes.create({ parentId: null, kind: 'task', title: 'Ctx Health A' })) as N
      const b = (await api.nodes.create({ parentId: null, kind: 'task', title: 'Ctx Health B' })) as N
      await api.nodes.relate(a.id, b.id)
      return { aId: a.id, bId: b.id }
    })

    const result = await app.evaluate(
      async ({ ipcMain }, { aId, bId }) => {
        type Handler = (event: unknown, ...args: unknown[]) => unknown
        const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers
        const fakeEvent = { sender: null }
        const related = (await handlers.get('context:related')?.(fakeEvent, aId)) as string[]
        const health = (await handlers.get('context:health')?.(fakeEvent, aId)) as { state: unknown }
        const markReviewed = await handlers.get('context:markReviewed')?.(fakeEvent, aId)
        const healthAfterReview = (await handlers.get('context:health')?.(fakeEvent, aId)) as { state: unknown }
        return {
          hasHandlers: {
            related: handlers.has('context:related'),
            health: handlers.has('context:health'),
            markReviewed: handlers.has('context:markReviewed')
          },
          related,
          health,
          markReviewed,
          healthAfterReview,
          bId
        }
      },
      { aId, bId }
    )

    expect(result.hasHandlers.related).toBe(true)
    expect(result.hasHandlers.health).toBe(true)
    expect(result.hasHandlers.markReviewed).toBe(true)

    expect(Array.isArray(result.related)).toBe(true)
    expect(result.related).toContain(result.bId)

    expect(typeof result.health).toBe('object')
    expect(result.health).toHaveProperty('state')

    expect(result.markReviewed).toBe(true)
    expect(typeof result.healthAfterReview).toBe('object')
    expect(result.healthAfterReview).toHaveProperty('state')
  } finally {
    await dispose()
  }
})
