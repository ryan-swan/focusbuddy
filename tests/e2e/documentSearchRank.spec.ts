// E2E coverage for the document-semantic-ranking change to searchAll:
// (1) document with body text is found by a body-term query (semantic pool keyword fallback),
// (2) document with a distinctive title but empty/whitespace body is still found by title
//     (the light title-only LIKE pass),
// (3) existing categories (task, knowledge) still surface — no regression from the refactor.

import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'
import type { SearchHit } from '../../src/shared/types'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ──────────────────────────────────────────────────────────────────────────────
// 1. Document with body text is found by a body-term query (semantic pool,
//    keyword fallback — no embedding key in the test harness).
// ──────────────────────────────────────────────────────────────────────────────

test('search.query finds a document by body text via the semantic pool keyword fallback', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `DOCBODY_${Date.now()}`

  // Create a document with a proper Tiptap body object (not a JSON string).
  // A plain string body double-encodes and makes extractDocText return '',
  // which causes loadDocItems to skip the document entirely.
  const docId = await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const doc = await api.documents.create({
      docType: 'doc',
      title: 'Unrelated title',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Annual leave policy ${t}` }]
          }
        ]
      }
    })
    return doc?.id ?? null
  }, token)

  expect(docId, 'document created').not.toBeNull()

  // Query by the body token (title does not contain it).
  const hits = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.search.query(q)
  }, token) as SearchHit[]

  const docHit = hits.find((h) => h.type === 'document' && h.id === docId)
  expect(docHit, `document must appear as a 'document' hit for body-term query "${token}"`).toBeDefined()
  expect(docHit!.score, 'document hit must have a positive score').toBeGreaterThan(0)
})

// ──────────────────────────────────────────────────────────────────────────────
// 2. Document with a matching title but no extractable body is still found by
//    the title-only LIKE fallback pass.
// ──────────────────────────────────────────────────────────────────────────────

test('search.query finds a titled-but-empty document by title via the LIKE fallback pass', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `DOCTITLE_${Date.now()}`

  // Create a document with a matching title and an empty body. The empty body
  // means extractDocText returns '' and loadDocItems skips it, so it never
  // enters the semantic pool. The title-only LIKE pass must catch it instead.
  const docId = await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    // Pass a minimal valid Tiptap body that has no text content so extractDocText returns ''.
    const doc = await api.documents.create({
      docType: 'doc',
      title: `Empty body document ${t}`,
      body: { type: 'doc', content: [{ type: 'paragraph' }] }
    })
    return doc?.id ?? null
  }, token)

  expect(docId, 'document created').not.toBeNull()

  const hits = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.search.query(q)
  }, token) as SearchHit[]

  const docHit = hits.find((h) => h.type === 'document' && h.id === docId)
  expect(docHit, `titled-but-empty document must appear via title LIKE pass for query "${token}"`).toBeDefined()
  expect(docHit!.score, 'title-only hit must have a positive score').toBeGreaterThan(0)
})

// ──────────────────────────────────────────────────────────────────────────────
// 3. Tasks are unregressed — they still appear after the document-path refactor.
// ──────────────────────────────────────────────────────────────────────────────

test('existing task category is unregressed after the document-path refactor', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `TASKREG_${Date.now()}`

  await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'task', title: `Task regression check ${t}` })
  }, token)

  const hits = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.search.query(q)
  }, token) as SearchHit[]

  const taskHit = hits.find((h) => h.type === 'task' && h.title.includes(token))
  expect(taskHit, `task hit must still appear after document refactor for query "${token}"`).toBeDefined()
})

// ──────────────────────────────────────────────────────────────────────────────
// 4. Knowledge entries are unregressed — still appear after the rename from
//    knowledgeHitScore to semanticHitScore.
// ──────────────────────────────────────────────────────────────────────────────

test('knowledge category is unregressed after semanticHitScore rename', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `KNOWREG_${Date.now()}`

  await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.knowledge.create({
      title: `Knowledge regression check ${t}`,
      body: 'Regression test for renamed scorer',
      tags: []
    })
  }, token)

  const hits = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.search.query(q)
  }, token) as SearchHit[]

  const kHit = hits.find((h) => h.type === 'knowledge' && h.title.includes(token))
  expect(kHit, `knowledge hit must still appear after semanticHitScore rename for query "${token}"`).toBeDefined()
  expect(kHit!.score, 'knowledge hit must have a positive score').toBeGreaterThan(0)
})

// ──────────────────────────────────────────────────────────────────────────────
// 5. Both a document (body match) and a task appear together in the same call.
// ──────────────────────────────────────────────────────────────────────────────

test('document body hit and task hit co-exist in the same search.query result', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const token = `MIXED2_${Date.now()}`

  const docId = await window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.nodes.create({ parentId: null, kind: 'task', title: `Mixed search task ${t}` })
    const doc = await api.documents.create({
      docType: 'doc',
      title: 'Mixed search doc',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `Mixed content ${t}` }] }]
      }
    })
    return doc?.id ?? null
  }, token)

  const hits = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.search.query(q)
  }, token) as SearchHit[]

  const taskHit = hits.find((h) => h.type === 'task' && h.title.includes(token))
  const docHit = hits.find((h) => h.type === 'document' && h.id === docId)

  expect(taskHit, 'task hit must appear').toBeDefined()
  expect(docHit, 'document hit must appear alongside task hit').toBeDefined()
})

// ──────────────────────────────────────────────────────────────────────────────
// 6. No-fakery: a document with no keyword overlap does not appear.
// ──────────────────────────────────────────────────────────────────────────────

test('document with no keyword overlap does not appear in results (no semantic key)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const noMatchToken = `NOMATCH2_${Date.now()}`

  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.documents.create({
      docType: 'doc',
      title: 'Avocado farming handbook',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tropical cultivation notes' }] }]
      }
    })
  })

  const hits = await window.evaluate(async (q: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.search.query(q)
  }, noMatchToken) as SearchHit[]

  const falsePositive = hits.find(
    (h) => h.type === 'document' && h.title.includes('Avocado')
  )
  expect(falsePositive, 'avocado doc must NOT appear for an unrelated query (no-fakery)').toBeUndefined()
})
