/**
 * E2E for PlexiDocs footnotes: they auto-number in document order, render as
 * clickable superscripts, edit through the popover, and persist on the body.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

async function openDocumentsHub(window: Page): Promise<void> {
  await gotoView(window, 'goDocuments')
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

test('DFN-1 — footnotes auto-number, render, edit and persist', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({
        docType: 'doc',
        title: 'Footnote doc',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'First point' },
                { type: 'footnote', attrs: { text: 'note one' } },
                { type: 'text', text: ' and second point' },
                { type: 'footnote', attrs: { text: '' } }
              ]
            }
          ]
        }
      })
    })

    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)
    await window.locator('text=Footnote doc').first().click()
    await expect(window.locator('[data-testid="doc-editor-surface"]')).toBeVisible({ timeout: 8_000 })

    const refs = window.locator('[data-testid="doc-footnote-ref"]')
    await expect(refs).toHaveCount(2, { timeout: 4_000 })
    await expect(refs.nth(0)).toContainText('[1]')
    await expect(refs.nth(1)).toContainText('[2]')

    await refs.nth(1).click()
    const input = window.locator('[data-testid="doc-footnote-input"]')
    await expect(input).toBeVisible({ timeout: 3_000 })
    await input.fill('See appendix B.')

    await window.waitForTimeout(1_600)
    const notes = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs[0].id)
      const found: string[] = []
      const walk = (n: unknown): void => {
        if (!n || typeof n !== 'object') return
        const node = n as { type?: string; attrs?: { text?: string }; content?: unknown[] }
        if (node.type === 'footnote') found.push(node.attrs?.text ?? '')
        if (Array.isArray(node.content)) node.content.forEach(walk)
      }
      walk((doc?.body as { doc?: unknown })?.doc)
      return found
    })
    expect(notes.length).toBe(2)
    expect(notes[0]).toBe('note one')
    expect(notes).toContain('See appendix B.')
  } finally {
    await dispose()
  }
})
