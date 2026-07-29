import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Tester-authored verification spec for the plexi-4.0 Context Health strip
// (commit f872a30). Not part of the permanent suite — ad hoc verification run.

test('CTX-HEALTH-STRIP — regression on setActive hot path + reachability of the strip', async () => {
  const { app, window, dispose } = await launchApp()
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  window.on('pageerror', (err) => pageErrors.push(err.message))
  let mainStderr = ''
  app.process().stderr?.on('data', (b) => { mainStderr += b.toString() })

  try {
    await waitForReady(window)

    // Create two top-level folders (rooms) and relate them via the same
    // window.api.nodes surface the UI uses.
    const ids = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      type N = { id: string; kind: string; parentId: string | null }
      const a = (await api.nodes.create({ parentId: null, kind: 'folder', title: 'Ctx Room A' })) as N
      const b = (await api.nodes.create({ parentId: null, kind: 'folder', title: 'Ctx Room B' })) as N
      await api.nodes.relate(a.id, b.id)
      // Edit B so it has a change on record.
      await api.nodes.update(b.id, { title: 'Ctx Room B (edited)' })
      return { a: a.id, b: b.id }
    })

    // Drive REAL navigation the way the app does: MainPane routes
    // 'project-dashboard' -> <Canvas/>, and App.tsx's view-sync effect calls
    // setActive(projectId) whenever the view is project-dashboard — so calling
    // goProject via the exposed view store below exercises the SAME setActive
    // hot path a user hits by clicking a desk tile, without depending on a
    // specific dashboard card being present in this fresh DB.
    for (let i = 0; i < 8; i++) {
      await window.evaluate((id) => {
        const w = window as unknown as { __fbView?: { getState: () => Record<string, (id: string) => void> } }
        w.__fbView?.getState().goProject?.(id)
      }, i % 2 === 0 ? ids.a : ids.b)
      await window.waitForTimeout(150)
    }

    // Let any fire-and-forget openDesk promise chains settle.
    await window.waitForTimeout(500)

    // Reachability check: does WorkspaceHeader / ContextHealthStrip actually
    // mount for the 'project-dashboard' view, or does MainPane render Canvas
    // (which has no WorkspaceHeader) instead?
    const domSnapshot = await window.evaluate(() => ({
      hasCaughtUpText: document.body.innerText.includes('Caught you up on'),
      hasRelatedChip: document.body.innerText.includes('Related'),
      hasShareButton: document.body.innerText.includes('Share this project'),
      hasFocusMode: document.body.innerText.includes('Focus Mode'),
      hasCanvasEmptyGallery: !!document.querySelector('[data-testid="desk-gallery"]'),
      bodySnippet: document.body.innerText.slice(0, 400)
    }))

    // Independent cross-check via the same context:* read surface the strip
    // itself calls, confirming the underlying data plumbing (not the UI) is
    // sound regardless of whether the component mounts.
    const apiCheck = await window.evaluate(async (id) => {
      const api = (window as unknown as { api: typeof window.api }).api
      if (!api.context) return { hasContextNamespace: false }
      const related = await api.context.related(id)
      const health = await api.context.health(id)
      return { hasContextNamespace: true, related, health }
    }, ids.a)

    // Final active-desk switch stability check.
    const activeAfter = await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { view: unknown } } }
      return w.__fbView?.getState().view
    })

    console.log('DOM_SNAPSHOT', JSON.stringify(domSnapshot))
    console.log('API_CHECK', JSON.stringify(apiCheck))
    console.log('ACTIVE_VIEW_AFTER', JSON.stringify(activeAfter))

    expect(pageErrors, `pageerror events: ${JSON.stringify(pageErrors)}`).toEqual([])
    const unexpectedConsoleErrors = consoleErrors.filter(
      (e) => !e.includes('Failed to load resource: the server responded with a status of 404')
    )
    expect(unexpectedConsoleErrors, `console.error: ${JSON.stringify(unexpectedConsoleErrors)}`).toEqual([])
    expect(mainStderr.includes('[context-engine]'), `main stderr:\n${mainStderr}`).toBe(false)
  } finally {
    await dispose()
  }
})
