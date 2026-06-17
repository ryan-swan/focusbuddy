import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('probe window.api.mail shape', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const result = await window.evaluate(() => {
      const w = window as unknown as {
        api?: {
          mail?: Record<string, unknown>
          [key: string]: unknown
        }
      }
      return {
        apiType: typeof w.api,
        mailType: typeof w.api?.mail,
        sendType: typeof (w.api?.mail as Record<string, unknown> | undefined)?.send,
        keys: w.api ? Object.keys(w.api) : [],
        mailKeys: w.api?.mail ? Object.keys(w.api.mail) : []
      }
    })
    console.log('API probe result:', JSON.stringify(result, null, 2))
  } finally {
    await dispose()
  }
})
