/**
 * E2E for the PlexiDocs Table of Contents: inserting it from the Insert menu
 * builds a list of the document's current headings, and Update rebuilds it.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

async function openDocumentsHub(window: Page): Promise<void> {
  await gotoView(window, 'goDocuments')
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

test('DTOC-1 — Insert > Table of contents lists the headings; Update refreshes', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({
        docType: 'doc',
        title: 'ToC doc',
        body: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Some intro text.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Background' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'More text.' }] }
          ]
        }
      })
    })

    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)
    await window.locator('text=ToC doc').first().click()
    await expect(window.locator('[data-testid="doc-editor-surface"]')).toBeVisible({ timeout: 8_000 })

    // Insert menu → Table of contents.
    await window.getByRole('button', { name: 'Insert', exact: true }).click()
    await window.locator('text=Table of contents').first().click()

    const toc = window.locator('[data-testid="doc-toc"]')
    await expect(toc).toBeVisible({ timeout: 4_000 })
    const items = toc.locator('[data-testid="doc-toc-item"]')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('Introduction')
    await expect(items.nth(1)).toContainText('Background')

    // Persisted: the ToC node with its items snapshot lands on the body.
    await window.waitForTimeout(1_600)
    const hasToc = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs.find((d) => d.docType === 'doc')!.id)
      const body = doc?.body as { doc?: { content?: Array<{ type: string; attrs?: { items?: unknown[] } }> } }
      const node = (body?.doc?.content ?? []).find((n) => n.type === 'tableOfContents')
      return { present: !!node, count: (node?.attrs?.items ?? []).length }
    })
    expect(hasToc.present).toBe(true)
    expect(hasToc.count).toBe(2)
  } finally {
    await dispose()
  }
})
