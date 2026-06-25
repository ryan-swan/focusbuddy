// E2E coverage for the document semantic-retrieval change.
// Verifies: (1) DocumentsView reindex call is a silent no-op without a key,
// (2) a document is surfaced by retrieveSources (via workspace:ask sources)
// using keyword fallback, (3) knowledge grounding still works alongside
// documents, (4) a document with no keyword overlap does not appear (no-fakery).
//
// All contract assertions drive window.api directly. The DocumentsView open
// step is a UI gesture to confirm the reindex call does not error on mount.

import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ──────────────────────────────────────────────────────────────────────────────
// 1. DocumentsView opens without a console error from documents:reindex
// ──────────────────────────────────────────────────────────────────────────────

test('DocumentsView loads without error from the reindex call (no key)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const errors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // Navigate to Documents via the sidebar button.
  const docsBtn = window.locator('button').filter({ hasText: 'Documents' }).first()
  await docsBtn.click()
  await window.waitForTimeout(800)

  // Filter out any pre-existing errors unrelated to reindex.
  const reindexErrors = errors.filter((e) => /reindex|embed|document/i.test(e))
  expect(reindexErrors, 'no console errors related to documents:reindex').toHaveLength(0)
})

// ──────────────────────────────────────────────────────────────────────────────
// 2. IPC contract: workspace:ask returns the document in its sources by keyword
// ──────────────────────────────────────────────────────────────────────────────

test('workspace.ask sources include a document matching the query by keyword (no embedding key)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `DOCSRCH_${Date.now()}`

  // Create a document with a proper Tiptap body object so extractDocText can
  // extract text. documents.create JSON.stringifies the body, so passing a plain
  // string would double-encode it and make extractDocText return ''.
  const docId = await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const doc = await api.documents.create({
      docType: 'doc',
      title: `Refund policy ${t}`,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Customers can return any product within 30 days ${t}` }]
          }
        ]
      }
    })
    return doc?.id ?? null
  }, token)

  expect(docId, 'document was created').not.toBeNull()

  // Call workspace:ask — with no AI key it returns needsApiKey:true but still
  // populates sources from retrieveSources (which runs before the AI call).
  const result = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    try {
      return await api.workspace.ask(q)
    } catch (e) {
      return { ok: false, error: String(e), sources: [] }
    }
  }, token) as {
    ok: boolean
    needsApiKey?: boolean
    sources?: Array<{ docId: string; title: string; docType: string; snippet: string; cited: boolean }>
    error?: string
  }

  // Either ok (with AI key) or needsApiKey — both are valid in this context.
  // What matters is that sources is populated.
  expect(result.sources, 'sources array must be present').toBeDefined()

  const docHit = result.sources!.find(
    (s) => s.docType !== 'knowledge' && s.title.includes(token)
  )
  expect(docHit, `document "${token}" must appear in workspace:ask sources`).toBeDefined()
})

// ──────────────────────────────────────────────────────────────────────────────
// 3. Regression: knowledge grounding still works alongside document grounding
// ──────────────────────────────────────────────────────────────────────────────

test('knowledge grounding is not regressed — knowledge entry still surfaces via workspace.ask', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `KBGROUND_${Date.now()}`

  // Create a knowledge entry.
  await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.knowledge.create({
      title: `Board offsite ${t}`,
      body: 'Annual planning session for executives',
      tags: ['strategy']
    })
  }, token)

  const result = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    try {
      return await api.workspace.ask(q)
    } catch (e) {
      return { ok: false, error: String(e), sources: [] }
    }
  }, token) as {
    ok: boolean
    needsApiKey?: boolean
    sources?: Array<{ docId: string; title: string; docType: string; snippet: string; cited: boolean }>
    error?: string
  }

  expect(result.sources, 'sources array must be present').toBeDefined()

  const kHit = result.sources!.find(
    (s) => s.docType === 'knowledge' && s.title.includes(token)
  )
  expect(kHit, `knowledge entry "${token}" must still surface via workspace.ask sources`).toBeDefined()
})

// ──────────────────────────────────────────────────────────────────────────────
// 4. Both a document and a knowledge entry surface together for a shared token
// ──────────────────────────────────────────────────────────────────────────────

test('document and knowledge sources both appear in the same workspace.ask call', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `MIXGRND_${Date.now()}`

  await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.documents.create({
      docType: 'doc',
      title: `Strategy overview ${t}`,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Annual planning notes ${t}` }]
          }
        ]
      }
    })
    await api.knowledge.create({
      title: `Strategy policy ${t}`,
      body: 'Corporate strategy reference',
      tags: []
    })
  }, token)

  const result = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    try {
      return await api.workspace.ask(q)
    } catch (e) {
      return { ok: false, error: String(e), sources: [] }
    }
  }, token) as {
    ok: boolean
    needsApiKey?: boolean
    sources?: Array<{ docId: string; title: string; docType: string; snippet: string; cited: boolean }>
    error?: string
  }

  expect(result.sources, 'sources array must be present').toBeDefined()

  const docHit = result.sources!.find((s) => s.docType !== 'knowledge' && s.title.includes(token))
  const kHit = result.sources!.find((s) => s.docType === 'knowledge' && s.title.includes(token))

  expect(docHit, 'document must appear in mixed sources').toBeDefined()
  expect(kHit, 'knowledge must appear in mixed sources').toBeDefined()
})

// ──────────────────────────────────────────────────────────────────────────────
// 5. No-fakery: document with zero keyword overlap does not appear in sources
// ──────────────────────────────────────────────────────────────────────────────

test('document with no keyword overlap does not appear in sources (no-fakery, semantic inactive)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const noMatchToken = `NOMATCH_${Date.now()}`

  // Create a document about "bananas" but query with a completely unrelated token.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.documents.create({
      docType: 'doc',
      title: 'Banana cultivation guide',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Tropical fruit growing techniques and harvest schedules' }]
          }
        ]
      }
    })
  })

  const result = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    try {
      return await api.workspace.ask(q)
    } catch (e) {
      return { ok: false, error: String(e), sources: [] }
    }
  }, noMatchToken) as {
    ok: boolean
    needsApiKey?: boolean
    sources?: Array<{ docId: string; title: string; docType: string }>
    error?: string
  }

  const falsePositive = result.sources?.find(
    (s) => s.docType !== 'knowledge' && s.title.includes('Banana')
  )
  expect(falsePositive, 'banana doc must NOT appear for an unrelated query (no-fakery)').toBeUndefined()
})
