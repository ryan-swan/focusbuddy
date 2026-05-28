import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
  randomUUID
} from 'crypto'
import { getDb } from './database'
import type {
  VaultEntryDraft,
  VaultEntryPatch,
  VaultEntryStored,
  VaultMeta
} from '@shared/types'

// ── Crypto constants ─────────────────────────────────────────────────────────
// PBKDF2-SHA256, 600k iterations = OWASP 2023 recommendation. Increase over time.
const ITERATIONS = 600_000
const KEY_LEN_BYTES = 32 // AES-256
const SALT_LEN_BYTES = 16
const IV_LEN_BYTES = 12 // GCM standard
const VERIFIER_PLAINTEXT = 'fb-vault-v1' // known-plaintext check after derivation

function deriveKey(masterPassword: string, salt: Buffer, iterations: number): Buffer {
  return pbkdf2Sync(masterPassword, salt, iterations, KEY_LEN_BYTES, 'sha256')
}

interface AesGcmResult {
  iv: string
  ciphertext: string // ciphertext || authTag — both base64
}

function aesGcmEncrypt(key: Buffer, plaintext: string): AesGcmResult {
  const iv = randomBytes(IV_LEN_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob = Buffer.concat([enc, tag])
  return { iv: iv.toString('base64'), ciphertext: blob.toString('base64') }
}

function aesGcmDecrypt(key: Buffer, ivB64: string, ciphertextB64: string): string {
  const iv = Buffer.from(ivB64, 'base64')
  const blob = Buffer.from(ciphertextB64, 'base64')
  const tag = blob.subarray(blob.length - 16)
  const enc = blob.subarray(0, blob.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

// ── Master key state — held in memory only ───────────────────────────────────
// Unlock derives the key once and caches it here; lock zeros it out.

let cachedKey: Buffer | null = null

export function isUnlocked(): boolean {
  return cachedKey !== null
}

export function lockVault(): void {
  if (cachedKey) cachedKey.fill(0)
  cachedKey = null
}

// ── Vault meta (existence + verifier) ────────────────────────────────────────

interface MetaRow {
  id: number
  salt: string
  verifier_iv: string
  verifier_ciphertext: string
  iterations: number
  created_at: number
  updated_at: number
}

export function getVaultMeta(): VaultMeta {
  const db = getDb()
  const row = db.prepare('SELECT * FROM vault_meta WHERE id = 1').get() as
    | MetaRow
    | undefined
  if (!row) {
    return {
      exists: false,
      iterations: ITERATIONS,
      salt: '',
      verifierIv: '',
      verifierCiphertext: ''
    }
  }
  return {
    exists: true,
    iterations: row.iterations,
    salt: row.salt,
    verifierIv: row.verifier_iv,
    verifierCiphertext: row.verifier_ciphertext,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * Initialize the vault with a master password. Generates a fresh salt, derives the
 * encryption key, encrypts a known plaintext as the verifier. Fails if a vault
 * already exists (use `changeMasterPassword` to re-key).
 */
export function createVault(
  masterPassword: string
): { ok: true } | { ok: false; error: string } {
  if (!masterPassword || masterPassword.length < 8) {
    return { ok: false, error: 'Master password must be at least 8 characters.' }
  }
  const db = getDb()
  const existing = db.prepare('SELECT id FROM vault_meta WHERE id = 1').get()
  if (existing) {
    return { ok: false, error: 'Vault already exists. Use unlock instead.' }
  }
  const salt = randomBytes(SALT_LEN_BYTES)
  const key = deriveKey(masterPassword, salt, ITERATIONS)
  const verifier = aesGcmEncrypt(key, VERIFIER_PLAINTEXT)
  const now = Date.now()
  db.prepare(
    `INSERT INTO vault_meta (id, salt, verifier_iv, verifier_ciphertext, iterations, created_at, updated_at)
     VALUES (1, @salt, @iv, @ct, @it, @now, @now)`
  ).run({
    salt: salt.toString('base64'),
    iv: verifier.iv,
    ct: verifier.ciphertext,
    it: ITERATIONS,
    now
  })
  cachedKey = key
  return { ok: true }
}

/**
 * Try to unlock the vault. Derives a key from the supplied password + stored salt,
 * decrypts the verifier blob — if it matches the known plaintext, the password
 * was correct and the key is cached in memory. Otherwise returns an error.
 */
export function unlockVault(
  masterPassword: string
): { ok: true } | { ok: false; error: string } {
  const meta = getVaultMeta()
  if (!meta.exists) return { ok: false, error: 'No vault yet. Create one first.' }
  const salt = Buffer.from(meta.salt, 'base64')
  const key = deriveKey(masterPassword, salt, meta.iterations)
  try {
    const plain = aesGcmDecrypt(key, meta.verifierIv, meta.verifierCiphertext)
    if (plain !== VERIFIER_PLAINTEXT) {
      key.fill(0)
      return { ok: false, error: 'Incorrect master password.' }
    }
    cachedKey = key
    return { ok: true }
  } catch {
    key.fill(0)
    return { ok: false, error: 'Incorrect master password.' }
  }
}

// ── Entry CRUD ───────────────────────────────────────────────────────────────

interface EntryRow {
  id: string
  title: string
  url: string | null
  username: string | null
  iv: string
  ciphertext: string
  sort_order: number
  created_at: number
  updated_at: number
}

function rowToEntry(row: EntryRow): VaultEntryStored {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    username: row.username,
    iv: row.iv,
    ciphertext: row.ciphertext,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listEntries(): VaultEntryStored[] {
  if (!isUnlocked()) return []
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT * FROM vault_entries ORDER BY sort_order ASC, created_at ASC'
    )
    .all() as EntryRow[]
  return rows.map(rowToEntry)
}

function nextSortOrder(): number {
  const db = getDb()
  const r = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM vault_entries')
    .get() as { next: number }
  return r.next
}

export function createEntry(draft: VaultEntryDraft): VaultEntryStored | null {
  if (!isUnlocked()) return null
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO vault_entries (id, title, url, username, iv, ciphertext, sort_order, created_at, updated_at)
     VALUES (@id, @title, @url, @username, @iv, @ct, @sortOrder, @now, @now)`
  ).run({
    id,
    title: draft.title,
    url: draft.url ?? null,
    username: draft.username ?? null,
    iv: draft.iv,
    ct: draft.ciphertext,
    sortOrder: nextSortOrder(),
    now
  })
  const row = db
    .prepare('SELECT * FROM vault_entries WHERE id = ?')
    .get(id) as EntryRow
  return rowToEntry(row)
}

export function updateEntry(
  id: string,
  patch: VaultEntryPatch
): VaultEntryStored | null {
  if (!isUnlocked()) return null
  const db = getDb()
  const fields: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  const cols: Array<[keyof VaultEntryPatch, string]> = [
    ['title', 'title'],
    ['url', 'url'],
    ['username', 'username'],
    ['iv', 'iv'],
    ['ciphertext', 'ciphertext']
  ]
  for (const [key, col] of cols) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) {
    const row = db
      .prepare('SELECT * FROM vault_entries WHERE id = ?')
      .get(id) as EntryRow | undefined
    return row ? rowToEntry(row) : null
  }
  fields.push('updated_at = @now')
  db.prepare(`UPDATE vault_entries SET ${fields.join(', ')} WHERE id = @id`).run(params)
  const row = db
    .prepare('SELECT * FROM vault_entries WHERE id = ?')
    .get(id) as EntryRow | undefined
  return row ? rowToEntry(row) : null
}

export function deleteEntry(id: string): boolean {
  if (!isUnlocked()) return false
  const db = getDb()
  const r = db.prepare('DELETE FROM vault_entries WHERE id = ?').run(id)
  return r.changes > 0
}

// ── Encryption helpers exposed via IPC ───────────────────────────────────────
// Renderer never sees the key. It sends plaintext for encryption, gets ciphertext
// back, and sends ciphertext for decryption, getting plaintext back. Both fail if
// the vault is locked.

export function encryptWithMaster(plaintext: string): AesGcmResult | null {
  if (!cachedKey) return null
  return aesGcmEncrypt(cachedKey, plaintext)
}

export function decryptWithMaster(iv: string, ciphertext: string): string | null {
  if (!cachedKey) return null
  try {
    return aesGcmDecrypt(cachedKey, iv, ciphertext)
  } catch {
    return null
  }
}
