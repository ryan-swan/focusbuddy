/**
 * E2E for the PlexiDocs accessibility checker (Tools → Check accessibility):
 * a doc with a missing-alt image and a skipped heading reports those issues; a
 * clean doc reports none.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

async function openDocumentsHub(window: Page): Promise<void> {
  await gotoView(window, 'goDocuments')
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

async function openSeededDoc(window: Page, title: string, content: unknown[]): Promise<void> {
  await window.evaluate(
    async ({ t, c }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({ docType: 'doc', title: t, body: { type: 'doc', content: c } })
    },
    { t: title, c: content }
  )
  await window.reload()
  await waitForReady(window)
  await openDocumentsHub(window)
  await window.locator(`text=${title}`).first().click()
  await expect(window.locator('[data-testid="doc-editor-surface"]')).toBeVisible({ timeout: 8_000 })
}

async function runCheck(window: Page): Promise<void> {
  await window.locator('[data-testid="doc-menu-tools"]').click()
  await window.locator('text=Check accessibility').first().click()
}

test('DA11Y-1 — flags missing alt text and a skipped heading', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await openSeededDoc(window, 'A11y bad doc', [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Skipped' }] },
      { type: 'image', attrs: { src: 'x.png', alt: '' } }
    ])

    await runCheck(window)
    const issues = window.locator('[data-testid="doc-a11y-issue"]')
    await expect(issues.first()).toBeVisible({ timeout: 4_000 })
    const text = await window.locator('[data-testid="doc-a11y-issues"]').textContent()
    expect(text).toMatch(/alt text/)
    expect(text).toMatch(/skips from H1 to H3/)
  } finally {
    await dispose()
  }
})

test('DA11Y-2 — a clean document reports no issues', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await openSeededDoc(window, 'A11y good doc', [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'All good here.' }] },
      { type: 'image', attrs: { src: 'x.png', alt: 'A described picture' } }
    ])

    await runCheck(window)
    await expect(window.locator('[data-testid="doc-a11y-clean"]')).toBeVisible({ timeout: 4_000 })
  } finally {
    await dispose()
  }
})
