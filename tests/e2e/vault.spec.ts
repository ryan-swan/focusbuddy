import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// Vault round-trip + Connected App binding tests. We can't drive the actual
// autofill against a real login page (would need a fixture HTTP server + real
// webview), but we can verify the cryptographic round-trip and the binding
// API the autofill consumes.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('vault create + unlock + entry encrypt/decrypt round-trip', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api

    // Fresh DB → no vault yet.
    const metaBefore = await api.vault.meta()
    if (metaBefore.exists) return { error: 'vault unexpectedly already exists' }

    const created = await api.vault.create('correct-horse-battery')
    if (!created.ok) return { error: 'create failed: ' + created.error }

    // Encrypt a secret + store an entry.
    const secret = JSON.stringify({ password: 's3cret!@#', notes: 'mfa codes in 1pass' })
    const enc = await api.vault.encrypt(secret)
    if (!enc) return { error: 'encrypt returned null' }

    const entry = await api.vault.createEntry({
      title: 'GitHub',
      url: 'https://github.com',
      username: 'octocat',
      iv: enc.iv,
      ciphertext: enc.ciphertext
    })
    if (!entry) return { error: 'createEntry returned null' }

    // Round-trip: decrypt should match the original plaintext exactly.
    const decrypted = await api.vault.decrypt(entry.iv, entry.ciphertext)

    // Lock → encrypt should now fail (key zeroed from memory).
    await api.vault.lock()
    const encAfterLock = await api.vault.encrypt('anything')

    // Re-unlock with wrong master should fail.
    const wrong = await api.vault.unlock('wrong-pass')
    // Right master should succeed and let us decrypt again.
    const right = await api.vault.unlock('correct-horse-battery')
    const decryptedAfterRelock = await api.vault.decrypt(entry.iv, entry.ciphertext)

    return {
      created: created.ok,
      decrypted,
      encAfterLock,
      wrongOk: wrong.ok,
      rightOk: right.ok,
      decryptedAfterRelock
    }
  })

  expect(result.error).toBeUndefined()
  expect(result.created).toBe(true)
  expect(result.decrypted).toBe(
    JSON.stringify({ password: 's3cret!@#', notes: 'mfa codes in 1pass' })
  )
  // Encryption MUST fail when locked — otherwise secrets would leak through the
  // IPC bridge after the user explicitly locked the vault.
  expect(result.encAfterLock).toBeNull()
  expect(result.wrongOk).toBe(false)
  expect(result.rightOk).toBe(true)
  // Decryption survives lock/unlock — same salt/master derives the same key.
  expect(result.decryptedAfterRelock).toBe(
    JSON.stringify({ password: 's3cret!@#', notes: 'mfa codes in 1pass' })
  )
})

test('Connected App vault binding survives reload (persists in DB)', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const { appId, entryId } = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api

    await api.vault.create('test-master-pw')
    const enc = await api.vault.encrypt(JSON.stringify({ password: 'pw' }))
    if (!enc) throw new Error('encrypt null')
    const entry = await api.vault.createEntry({
      title: 'Notion',
      url: 'https://notion.so',
      username: 'me@example.com',
      iv: enc.iv,
      ciphertext: enc.ciphertext
    })
    if (!entry) throw new Error('entry null')

    const app = await api.connectedApps.create({
      title: 'Notion',
      url: 'https://notion.so'
    })

    // Bind the vault entry to the connected app.
    const updated = await api.connectedApps.update(app.id, { vaultEntryId: entry.id })
    if (!updated || updated.vaultEntryId !== entry.id) {
      throw new Error('bind failed: ' + JSON.stringify(updated))
    }
    return { appId: app.id, entryId: entry.id }
  })

  // Reload window — store hydrates from DB.
  await window.reload()
  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const reread = await window.evaluate(async (boundAppId: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const list = await api.connectedApps.list()
    return list.find((a) => a.id === boundAppId) ?? null
  }, appId)

  expect(reread).not.toBeNull()
  expect(reread!.vaultEntryId).toBe(entryId)
  expect(reread!.autofillEnabled).toBe(true)
})

test('autofillEnabled toggle persists', async () => {
  launched = await launchApp()
  const { window } = launched

  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const app = await api.connectedApps.create({
      title: 'X',
      url: 'https://x.example'
    })
    const off = await api.connectedApps.update(app.id, { autofillEnabled: false })
    const on = await api.connectedApps.update(app.id, { autofillEnabled: true })
    return { initial: app.autofillEnabled, off: off?.autofillEnabled, on: on?.autofillEnabled }
  })

  expect(result.initial).toBe(true)
  expect(result.off).toBe(false)
  expect(result.on).toBe(true)
})
