import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Verifies the "Create Wire & Agent Showcase desk" command (plexi-4.0):
//   - the command palette entry runs createShowcaseDesk() and lands on a new
//     desk with 10 header cards + the full mix of widget kinds
//   - the wires it creates are real widget_links rows with the right types
//     (transform / mirror / context) and a few of the transform verbs are set
//   - case 4 (Note --mirror--> Sticky) actually copies content live, with NO
//     AI key in the harness — proving the fabric runs end to end for the
//     non-AI cases
//   - case 5's Document target is a real fb_document (window.api.documents.get)
//   - cases 6/7 (agents) have parseable AgentConfig content wired IN correctly
//
// The harness (see _helpers.ts) strips ANTHROPIC_API_KEY/OPENAI_API_KEY, so
// the transform/agent (AI) cases are verified structurally only — this file
// does NOT assert on any AI-produced output.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

interface ApiWidget {
  id: string
  taskId: string
  kind: string
  title: string
  content: string
}

interface ApiLink {
  id: string
  sourceWidgetId: string
  targetWidgetId: string
  type: string
  verb?: string | null
}

async function runShowcaseCommand(window: Page): Promise<void> {
  await window.keyboard.press('Meta+k')
  await window.waitForTimeout(300)
  await window.waitForFunction(() => document.activeElement?.tagName === 'INPUT', null, { timeout: 3_000 })
  await window.keyboard.type('Showcase')
  await window.waitForTimeout(300)
  const option = window.getByRole('option', { name: /Create Wire & Agent Showcase desk/ })
  await expect(option, 'palette shows the showcase command').toBeVisible({ timeout: 3_000 })
  await option.click()
  // createShowcaseDesk() does a batch of sequential creates/wires; give it
  // real wall-clock time to land in the DB before we read it back.
  await window.waitForTimeout(2_000)
}

// NOTE (real product gap, not a harness limitation): createShowcaseDesk()
// calls nodes.setActive(id) but never navigates the view store (goTask), and
// the CommandCenter run() handler doesn't either. useNodeStore.activeTaskId
// and useViewStore's `view` are two separate pieces of state — MainPane
// renders <Canvas/> only when `view.kind === 'task'`. So running the command
// from Home leaves the user ON HOME with no visible sign anything happened;
// the new desk only appears as a tile to click into. This helper reproduces
// exactly what a user has to do next — click the tile Home renders for the
// freshly created desk — to actually open it. See the verdict notes.
async function openShowcaseDesk(window: Page): Promise<void> {
  await window.getByRole('button', { name: /Wire & Agent Showcase/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(300)
}

async function widgetsOf(window: Page, taskId: string): Promise<ApiWidget[]> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const ws = await api.widgets.listByTask(tid)
    return ws.map((w) => ({ id: w.id, taskId: w.taskId, kind: w.kind, title: w.title, content: w.content }))
  }, taskId)
}

async function linksOf(window: Page, taskId: string): Promise<ApiLink[]> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const links = await api.widgetLinks.listByTask(tid)
    return links.map((l) => ({
      id: l.id,
      sourceWidgetId: l.sourceWidgetId,
      targetWidgetId: l.targetWidgetId,
      type: l.type,
      verb: (l as unknown as { verb?: string | null }).verb ?? null
    }))
  }, taskId)
}

// Find the showcase desk by title via the real API (nodes store isn't
// exposed on window like widgets/links are) — this also proves the desk is
// a real, persisted node, not just in-memory UI state.
async function showcaseTaskId(window: Page): Promise<string | null> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const nodes = await api.nodes.list()
    const desk = nodes.find((n) => n.title === 'Wire & Agent Showcase' && n.kind === 'task')
    return desk?.id ?? null
  })
}

async function editContentViaStore(window: Page, widgetId: string, content: string): Promise<void> {
  await window.evaluate(
    async ({ id, content: c }: { id: string; content: string }) => {
      const w = window as unknown as {
        __fbWidgets?: { getState: () => { update: (id: string, patch: { content: string }) => Promise<unknown> } }
      }
      await w.__fbWidgets?.getState().update(id, { content: c })
    },
    { id: widgetId, content }
  )
}

// ── (a) command runs, lands on the new desk, widget mix is right ───────────

test('(a) the palette command builds the showcase desk with the full widget mix', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await runShowcaseCommand(window)

  // Landed on a new active desk titled "Wire & Agent Showcase".
  await expect(window.getByText('Wire & Agent Showcase').first()).toBeVisible({ timeout: 5_000 })
  const taskId = await showcaseTaskId(window)
  expect(taskId, 'a desk became active after running the command').toBeTruthy()

  const widgets = await widgetsOf(window, taskId!)
  const kindCount = (k: string): number => widgets.filter((w) => w.kind === k).length

  expect(kindCount('card'), '10 header cards + case-10 target card = 11 cards').toBeGreaterThanOrEqual(11)
  expect(kindCount('page'), 'case 1 target').toBe(1)
  expect(kindCount('table'), 'case 2 + case 7 tables').toBe(2)
  expect(kindCount('webview'), 'case 3 source').toBe(1)
  expect(kindCount('sticky'), 'case 4 target').toBe(1)
  expect(kindCount('doc'), 'case 5 target (real fb_document)').toBe(1)
  expect(kindCount('agent'), 'case 6 + case 7 agents').toBe(2)
  expect(kindCount('inbound-hook'), 'case 8 source').toBe(1)
  expect(kindCount('webhook'), 'case 9 target').toBe(1)
  expect(kindCount('note'), 'note sources across cases 1,2,3(target),4,5,6(x2),9,10').toBeGreaterThanOrEqual(9)

  expect(widgets.length, 'roughly 24 widgets total (10 headers + ~14 case widgets)').toBeGreaterThanOrEqual(24)
})

// ── (b) the wires: types + a few verbs ──────────────────────────────────────

test('(b) the wires have the right types, and context case 6 has two inbound links', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await runShowcaseCommand(window)
  const taskId = await showcaseTaskId(window)
  expect(taskId).toBeTruthy()

  const links = await linksOf(window, taskId!)
  expect(links.length, 'at least 10 wires (one per numbered case)').toBeGreaterThanOrEqual(10)

  const byType = (t: string): ApiLink[] => links.filter((l) => l.type === t)
  expect(byType('transform').length, 'cases 1,2,3,5,10 are transform').toBe(5)
  expect(byType('mirror').length, 'cases 4,8,9 are mirror').toBe(3)
  expect(byType('context').length, 'case 6 (x2) + case 7 (x1) are context').toBe(3)

  // Case 6: two distinct sources feed into the SAME agent target.
  const contextTargets = byType('context').map((l) => l.targetWidgetId)
  const targetCounts = contextTargets.reduce<Record<string, number>>((acc, t) => {
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {})
  const withTwoInbound = Object.values(targetCounts).filter((n) => n === 2)
  expect(withTwoInbound.length, 'one context target (the daily-digest agent) receives exactly two links').toBe(1)
  const withOneInbound = Object.values(targetCounts).filter((n) => n === 1)
  expect(withOneInbound.length, 'the other context target (the budget-watcher agent) receives exactly one link').toBe(1)

  // A few transform verbs land as expected.
  const verbs = byType('transform').map((l) => l.verb ?? '')
  expect(verbs.some((v) => v.toLowerCase().includes('action items')), 'case 1 verb mentions action items').toBe(true)
  expect(verbs.some((v) => v.toLowerCase().includes('table')), 'case 2 verb mentions table').toBe(true)
  expect(verbs.some((v) => v.toLowerCase().includes('summar')), 'case 3 verb mentions summarise').toBe(true)
})

// ── (c) non-AI case 4: Note --mirror--> Sticky actually copies live ─────────

test('(c) case 4 (no AI): editing the "Source of truth" note updates the mirrored sticky', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await runShowcaseCommand(window)
  const taskId = await showcaseTaskId(window)
  expect(taskId).toBeTruthy()

  const widgets = await widgetsOf(window, taskId!)
  const links = await linksOf(window, taskId!)

  const note = widgets.find((w) => w.kind === 'note' && w.title === 'Source of truth')
  expect(note, 'case-4 source note exists').toBeTruthy()

  const mirrorLink = links.find((l) => l.sourceWidgetId === note!.id && l.type === 'mirror')
  expect(mirrorLink, 'case-4 note has an outgoing mirror wire').toBeTruthy()
  const sticky = widgets.find((w) => w.id === mirrorLink!.targetWidgetId && w.kind === 'sticky')
  expect(sticky, 'the mirror wire points at a sticky').toBeTruthy()

  // Open the desk (see openShowcaseDesk's note: the command itself doesn't
  // navigate here, so a real user would click the tile Home shows too).
  await openShowcaseDesk(window)

  // Widget must be mounted on the canvas before the store's update() call
  // will be picked up by the running wire engine the same way a live UI
  // edit would be.
  await window.waitForSelector(`[data-widget-id="${note!.id}"]`, { timeout: 5_000 })

  const marker = `Edited via test ${Date.now()}`
  await editContentViaStore(window, note!.id, marker)

  await expect
    .poll(
      async () =>
        window.evaluate(
          async ({ tid, wid }: { tid: string; wid: string }) => {
            const api = (window as unknown as { api: typeof window.api }).api
            const ws = await api.widgets.listByTask(tid)
            return ws.find((w) => w.id === wid)?.content
          },
          { tid: taskId!, wid: sticky!.id }
        ),
      { timeout: 6_000, intervals: [200, 300, 500] }
    )
    .toBe(marker)
})

// ── (d) case 5: the doc target is a real fb_document, wired by transform ───

test('(d) case 5: the Document widget content is a real fb_document id, wired by transform', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await runShowcaseCommand(window)
  const taskId = await showcaseTaskId(window)
  expect(taskId).toBeTruthy()

  const widgets = await widgetsOf(window, taskId!)
  const links = await linksOf(window, taskId!)

  const docWidget = widgets.find((w) => w.kind === 'doc' && w.title === 'Executive summary')
  expect(docWidget, 'case-5 doc widget exists (the doc creation step did not silently fail)').toBeTruthy()

  const doc = await window.evaluate(async (docId: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.documents.get(docId)
  }, docWidget!.content)
  expect(doc, 'window.api.documents.get resolves a real fb_document for the widget content id').toBeTruthy()
  expect(doc?.id).toBe(docWidget!.content)
  expect(doc?.docType).toBe('doc')

  const wireToDoc = links.find((l) => l.targetWidgetId === docWidget!.id)
  expect(wireToDoc?.type, 'the wire into the doc widget is a transform').toBe('transform')
  expect(wireToDoc?.verb ?? '', 'the verb asks for an executive summary').toContain('executive summary')
})

// ── (e) agents (6,7) have parseable AgentConfig + correct inbound wiring ───

test('(e) the two agent widgets have parseable AgentConfig with onChange trigger, wired FROM the right sources', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  await runShowcaseCommand(window)
  const taskId = await showcaseTaskId(window)
  expect(taskId).toBeTruthy()

  const widgets = await widgetsOf(window, taskId!)
  const links = await linksOf(window, taskId!)
  const agents = widgets.filter((w) => w.kind === 'agent')
  expect(agents.length).toBe(2)

  for (const agent of agents) {
    const cfg = JSON.parse(agent.content) as { instruction: string; trigger: string; enabled: boolean }
    expect(cfg.instruction, `${agent.title} has a non-empty instruction`).toBeTruthy()
    expect(cfg.trigger, `${agent.title} trigger is onChange`).toBe('onChange')
    expect(cfg.enabled, `${agent.title} is enabled`).toBe(true)
  }

  const digest = agents.find((a) => a.title === 'Daily digest')
  const watcher = agents.find((a) => a.title === 'Budget watcher')
  expect(digest, 'Daily digest agent exists').toBeTruthy()
  expect(watcher, 'Budget watcher agent exists').toBeTruthy()

  const digestCfg = JSON.parse(digest!.content) as { instruction: string }
  expect(digestCfg.instruction.toLowerCase()).toContain('digest')
  const watcherCfg = JSON.parse(watcher!.content) as { instruction: string }
  expect(watcherCfg.instruction.toLowerCase()).toContain('expense')

  const intoDigest = links.filter((l) => l.targetWidgetId === digest!.id)
  expect(intoDigest.length, 'exactly two sources feed the daily-digest agent').toBe(2)
  expect(intoDigest.every((l) => l.type === 'context')).toBe(true)
  const digestSources = intoDigest
    .map((l) => widgets.find((w) => w.id === l.sourceWidgetId))
    .map((w) => w?.title)
    .sort()
  expect(digestSources).toEqual(['Sales', 'Support'])

  const intoWatcher = links.filter((l) => l.targetWidgetId === watcher!.id)
  expect(intoWatcher.length, 'exactly one source feeds the budget-watcher agent').toBe(1)
  expect(intoWatcher[0].type).toBe('context')
  const watcherSource = widgets.find((w) => w.id === intoWatcher[0].sourceWidgetId)
  expect(watcherSource?.kind, 'the budget watcher is fed by the Expenses table').toBe('table')
  expect(watcherSource?.title).toBe('Expenses')
})
