import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Local-AI document enrichment, end to end in the BUILT app against a real Ollama
// server. Seeds a document, runs the enrichment IPC, and asserts the full chain
// (IPC -> extract text -> local model -> parse -> store) plus local embeddings
// actually ran. When no local model is reachable (e.g. CI), it verifies the
// honest-degradation path instead, so it is never a false green.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('enriches a document via the local model + indexes it locally (or degrades honestly)', async () => {
  test.setTimeout(160_000)
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const docId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const doc = await api.documents.create({
      docType: 'doc',
      title: 'Cynder Rollout Plan',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'A 30-60-90 day rollout plan for deploying Campfire.AI at Cynder. Phase one covers finance data migration and CFO sign-off.'
              }
            ]
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Kickoff is 1 August 2026 and go-live is 30 October 2026. Owner: Michael.' }
            ]
          }
        ]
      }
    } as Parameters<typeof api.documents.create>[0])
    return doc.id
  })

  const status = await window.evaluate(() =>
    (window as unknown as { api: typeof window.api }).api.localAi.status()
  )
  const enrichRes = await window.evaluate(
    (id) => (window as unknown as { api: typeof window.api }).api.documents.enrich(id),
    docId
  )

  if (!status.available || enrichRes.reason === 'no_local_model') {
    // Honest degradation: nothing enriched, no metadata invented.
    expect(enrichRes.ok).toBe(false)
    const md = await window.evaluate(
      (id) => (window as unknown as { api: typeof window.api }).api.documents.metadata(id),
      docId
    )
    expect(md).toBeNull()
    test.info().annotations.push({
      type: 'note',
      description: 'Ollama not reachable — verified honest degradation instead of live enrichment.'
    })
    return
  }

  // Ollama is up: the document got real, stored metadata.
  expect(enrichRes.ok).toBe(true)
  const md = await window.evaluate(
    (id) => (window as unknown as { api: typeof window.api }).api.documents.metadata(id),
    docId
  )
  expect(md).not.toBeNull()
  expect(md!.summary.length).toBeGreaterThan(0)
  expect(md!.model.length).toBeGreaterThan(0)

  // Local embeddings: the document is embedded via the local embedder (on save,
  // and reindex is a deterministic backstop that awaits any pending index), so
  // document semantic search becomes active with NO cloud key. reindex.embedded
  // may be 0 here because the create-time auto-embed already ran — the meaningful
  // signal is that vectors now exist.
  await window.evaluate(() =>
    (window as unknown as { api: typeof window.api }).api.documents.reindex()
  )
  const active = await window.evaluate(() =>
    (window as unknown as { api: typeof window.api }).api.documents.semanticActive()
  )
  expect(active).toBe(true)
})
