import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Widget links feed the relationship graph (plexi-4.0). A link the user draws
// between two widgets becomes a confirmed RelatedTo edge, so context.related
// reflects it, decision-risk propagates across it, and deleting the link removes
// it (unless another link still connects the pair). Driven through window.api:
// the link create/delete + context reads are the contract under test, not the
// ghost-line drag gesture (which the LinkOverlay specs already cover).

interface Api {
  nodes: { create: (d: unknown) => Promise<{ id: string }> }
  widgets: { create: (d: unknown) => Promise<{ id: string }>; update: (id: string, p: unknown) => Promise<unknown> }
  widgetLinks: {
    create: (a: string, b: string, taskId: string) => Promise<{ id: string } | null>
    delete: (id: string) => Promise<boolean>
  }
  context: {
    related: (id: string) => Promise<string[]>
    health: (id: string) => Promise<{ state: string; decisionsAtRisk: Array<{ decisionId: string }> }>
    markReviewed: (id: string) => Promise<boolean>
  }
  decisions: { create: (i: unknown) => Promise<{ id: string }> }
}
test('a widget link creates a graph relationship both ways, and delete removes it', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const r = await window.evaluate(async () => {
      function api(w: Window): Api { return (w as unknown as { api: Api }).api }
      const a = api(window)
      const desk = await a.nodes.create({ parentId: null, kind: 'task', title: 'Link graph desk' })
      const w1 = await a.widgets.create({ taskId: desk.id, kind: 'sticky', title: 'A', content: 'a', x: 40, y: 40, width: 200, height: 160 })
      const w2 = await a.widgets.create({ taskId: desk.id, kind: 'sticky', title: 'B', content: 'b', x: 300, y: 40, width: 200, height: 160 })
      const link = await a.widgetLinks.create(w1.id, w2.id, desk.id)
      const relAtoB = await a.context.related(w1.id)
      const relBtoA = await a.context.related(w2.id)
      await a.widgetLinks.delete(link!.id)
      const relAfter = await a.context.related(w1.id)
      return { a: w1.id, b: w2.id, relAtoB, relBtoA, relAfter }
    })
    expect(r.relAtoB, 'A related to B after link').toContain(r.b)
    expect(r.relBtoA, 'B related to A after link').toContain(r.a)
    expect(r.relAfter, 'relation gone after deleting the only link').not.toContain(r.b)
  } finally {
    await dispose()
  }
})

test('deleting one of two links between the same pair keeps the relationship', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const r = await window.evaluate(async () => {
      function api(w: Window): Api { return (w as unknown as { api: Api }).api }
      const a = api(window)
      const desk = await a.nodes.create({ parentId: null, kind: 'task', title: 'Two links desk' })
      const w1 = await a.widgets.create({ taskId: desk.id, kind: 'sticky', title: 'A', content: 'a', x: 40, y: 40, width: 200, height: 160 })
      const w2 = await a.widgets.create({ taskId: desk.id, kind: 'sticky', title: 'B', content: 'b', x: 300, y: 40, width: 200, height: 160 })
      const l1 = await a.widgetLinks.create(w1.id, w2.id, desk.id) // A -> B
      const l2 = await a.widgetLinks.create(w2.id, w1.id, desk.id) // B -> A
      await a.widgetLinks.delete(l1!.id)
      const afterOne = await a.context.related(w1.id)
      await a.widgetLinks.delete(l2!.id)
      const afterBoth = await a.context.related(w1.id)
      return { b: w2.id, afterOne, afterBoth }
    })
    expect(r.afterOne, 'still related after deleting only one of two links').toContain(r.b)
    expect(r.afterBoth, 'related gone after deleting both links').not.toContain(r.b)
  } finally {
    await dispose()
  }
})

test('decision-risk propagates across a user-drawn link', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const state = await window.evaluate(async () => {
      function api(w: Window): Api { return (w as unknown as { api: Api }).api }
      const a = api(window)
      const desk = await a.nodes.create({ parentId: null, kind: 'task', title: 'Propagation desk' })
      const proposal = await a.widgets.create({ taskId: desk.id, kind: 'sticky', title: 'Proposal', content: 'p', x: 40, y: 40, width: 200, height: 160 })
      const pricing = await a.widgets.create({ taskId: desk.id, kind: 'sticky', title: 'Pricing', content: 'v1', x: 300, y: 40, width: 200, height: 160 })
      // Link them (pricing feeds the proposal), and flag the proposal as a decision.
      await a.widgetLinks.create(proposal.id, pricing.id, desk.id)
      await a.decisions.create({ title: 'Ship the proposal', relatedObjectIds: [proposal.id], affectedDeskIds: [desk.id] })
      // Baseline the proposal, then change the linked pricing widget.
      await a.context.markReviewed(proposal.id)
      await a.widgets.update(pricing.id, { content: 'v2 — new pricing' })
      return a.context.health(proposal.id)
    })
    // A change to the linked pricing widget lights the proposal up as decision-risk.
    expect(state.state, 'proposal reaches decision-risk when a linked widget changes').toBe('decision-risk')
    expect(state.decisionsAtRisk.length, 'the decision is named').toBeGreaterThan(0)
  } finally {
    await dispose()
  }
})
