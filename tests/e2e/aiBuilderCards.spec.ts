import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// AI Builder ("Build with AI") workspace dialog — the free-form generator whose
// SuggestionCards were restyled onto the shared ProposalCards visual language.
// We seed the build hand-off directly (via the __fbAiCmd store handle) so the
// dialog opens in its 'ready' stage WITHOUT a live AI round-trip, then verify the
// restyled cards render (title + kind label + per-kind preview), the multi-select
// count tracks, and "Add to canvas" spawns exactly the picked objects.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

const SUGGESTIONS = [
  {
    id: 's-table',
    kind: 'table',
    title: 'Client tracker',
    reason: 'Keep every client and their status in one place.',
    tableSchema: {
      columns: [
        { id: 'c1', type: 'text', label: 'Name', config: {} },
        { id: 'c2', type: 'select', label: 'Status', config: {} }
      ]
    }
  },
  {
    id: 's-page',
    kind: 'page',
    title: 'Project brief',
    reason: 'A place to write the plan.',
    pageContent: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Goals' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Timeline' }] }
      ]
    }
  },
  {
    id: 's-note',
    kind: 'sticky',
    title: 'Quick note',
    reason: 'Jot anything down.',
    content: 'Remember to follow up on the proposal by Friday.'
  }
]

async function openBuilderWithSeed(l: LaunchedApp): Promise<void> {
  const { window } = l
  await waitForReady(window)
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'task', title: 'BuilderHost' })
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /BuilderHost/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
  // Seed the build hand-off; Canvas opens the builder when suggestions arrive
  // (no AI round-trip — the dialog jumps straight to its 'ready' stage).
  await window.evaluate((suggestions) => {
    const store = (
      window as unknown as {
        __fbAiCmd?: { getState: () => { setHandoff: (h: unknown) => void } }
      }
    ).__fbAiCmd
    store?.getState().setHandoff({ suggestions, intent: 'Set up my client work' })
  }, SUGGESTIONS)
}

test('Build-with-AI cards render (restyled), select, and add to canvas', async () => {
  launched = await launchApp()
  const { window } = launched
  await openBuilderWithSeed(launched)

  // Dialog opened with the seeded suggestions in the 'ready' stage.
  await expect(window.getByRole('heading', { name: 'Build with AI' })).toBeVisible({ timeout: 6_000 })

  // All three restyled cards render — title + intent echo.
  await expect(window.getByText('Set up my client work')).toBeVisible()
  await expect(window.getByText('Client tracker')).toBeVisible()
  await expect(window.getByText('Project brief')).toBeVisible()
  await expect(window.getByText('Quick note')).toBeVisible()
  // Per-kind previews from SuggestionPreview (kept alongside the restyle).
  await expect(window.getByText('# Goals')).toBeVisible() // page heading chip
  await expect(window.getByText(/Status/).first()).toBeVisible() // table column chip

  // Multi-select count starts all-selected and tracks a toggle.
  await expect(window.getByText('3 of 3 selected')).toBeVisible()
  await window.getByText('Quick note').click() // deselect the note card
  await expect(window.getByText('2 of 3 selected')).toBeVisible()

  // Add the 2 picked objects to the canvas.
  await window.getByRole('button', { name: /Add 2 to canvas/ }).click()

  // Dialog closes and exactly the picked objects land as widgets on the desk.
  await expect(window.getByRole('heading', { name: 'Build with AI' })).toHaveCount(0, {
    timeout: 8_000
  })
  await expect(async () => {
    const titles = await window.evaluate(() => {
      const s = (
        window as unknown as {
          __fbWidgets?: { getState: () => { widgets: Array<{ title: string }> } }
        }
      ).__fbWidgets?.getState()
      return (s?.widgets ?? []).map((w) => w.title)
    })
    expect(titles).toContain('Client tracker')
    expect(titles).toContain('Project brief')
    expect(titles).not.toContain('Quick note') // deselected — never added
  }).toPass({ timeout: 8_000 })
})
