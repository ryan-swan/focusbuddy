import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Vault master-password rotation. The risky part is correctness: rotation must
// re-encrypt the verifier AND every entry under the new key, atomically, so the
// old password stops working, the new one works, and no stored secret is lost.
// We drive the real vault IPC (real SQLite, real AES-GCM) end to end.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('VR-1 — changing the master password re-keys every entry and old password stops working', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const OLD = 'old-master-pw-123'
    const NEW = 'new-master-pw-456'

    // Fresh vault, then two entries with distinct secrets.
    const created = await api.vault.create(OLD)
    if (!created.ok) return { stage: 'create', error: created.error }

    const seed = async (title: string, secret: unknown): Promise<void> => {
      const enc = await api.vault.encrypt(JSON.stringify(secret))
      if (!enc) throw new Error('encrypt returned null')
      await api.vault.createEntry({
        title,
        url: null,
        username: 'user@example.com',
        iv: enc.iv,
        ciphertext: enc.ciphertext
      })
    }
    await seed('GitHub', { password: 'gh-hunter2', notes: 'work' })
    await seed('Bank', { password: 'bank-s3cret', totp: 'JBSWY3DPEHPK3PXP' })

    // Rotate.
    const rotated = await api.vault.changeMasterPassword(OLD, NEW)
    if (!rotated.ok) return { stage: 'rotate', error: rotated.error }

    // Wrong-current-password rotations must be rejected.
    const badRotate = await api.vault.changeMasterPassword('not-the-password', 'whatever-123')

    // Lock, then the OLD password must fail and the NEW one must succeed.
    await api.vault.lock()
    const unlockedOld = await api.vault.unlock(OLD)
    await api.vault.lock()
    const unlockedNew = await api.vault.unlock(NEW)

    // Under the new key, every secret must decrypt back to its original value.
    const entries = await api.vault.listEntries()
    const byTitle: Record<string, unknown> = {}
    for (const e of entries) {
      const plain = await api.vault.decrypt(e.iv, e.ciphertext)
      byTitle[e.title] = plain ? JSON.parse(plain) : null
    }

    return {
      stage: 'done',
      rotatedOk: rotated.ok,
      badRotateRejected: !badRotate.ok,
      oldPasswordRejected: !unlockedOld.ok,
      newPasswordAccepted: unlockedNew.ok,
      github: byTitle['GitHub'],
      bank: byTitle['Bank'],
      entryCount: entries.length
    }
  })

  expect(result.stage).toBe('done')
  expect(result.rotatedOk).toBe(true)
  expect(result.badRotateRejected).toBe(true)
  expect(result.oldPasswordRejected).toBe(true)
  expect(result.newPasswordAccepted).toBe(true)
  expect(result.entryCount).toBe(2)
  // Secrets survived the re-key intact.
  expect(result.github).toEqual({ password: 'gh-hunter2', notes: 'work' })
  expect(result.bank).toEqual({ password: 'bank-s3cret', totp: 'JBSWY3DPEHPK3PXP' })
})
