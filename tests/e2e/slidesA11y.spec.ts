/**
 * E2E for the PlexiSlides accessibility checker (View → Check accessibility):
 * a deck with a missing-alt image and a titleless slide reports those issues.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, gotoView } from './_helpers'

async function openDocumentsHub(window: Page): Promise<void> {
  await gotoView(window, 'goDocuments')
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

test('SA11Y-1 — flags missing image alt text and a titleless slide', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({
        docType: 'slides',
        title: 'A11y deck',
        body: {
          schemaVersion: 2,
          slides: [
            {
              id: 's1',
              notes: '',
              schemaVersion: 2,
              elements: [{ id: 'img1', type: 'image', x: 100, y: 100, w: 300, h: 200, z: 1, src: 'x.png' }]
            }
          ]
        }
      })
    })

    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)
    await window.locator('text=A11y deck').first().click()
    await expect(window.locator('[data-testid="slides-toolbar"]')).toBeVisible({ timeout: 10_000 })

    await window.getByRole('button', { name: 'View', exact: true }).click()
    await window.locator('text=Check accessibility').first().click()

    await expect(window.locator('[data-testid="slides-a11y-modal"]')).toBeVisible({ timeout: 4_000 })
    const text = await window.locator('[data-testid="slides-a11y-issues"]').textContent()
    expect(text).toMatch(/alt text/)
    expect(text).toMatch(/no title text/)
  } finally {
    await dispose()
  }
})
