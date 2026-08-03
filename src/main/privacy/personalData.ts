// Sealed personal data (spec §44.1, PLX-SEC-030, DOM-032; ADR-0003). Personal data
// is encrypted under the subject's key before it is referenced from any Event or
// derived store, and referenced by an immutable content digest, never inlined in
// clear (DOM-032). Opening it requires the live key; once the key is destroyed the
// same ciphertext opens to a permanent tombstone, not clear text and not a masked
// error — an honest "erased, unrecoverable".

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { SubjectKeyRegistry } from './subjectKeys'

// The reference an Event/store keeps. It holds ciphertext, never plaintext, and a
// digest of the plaintext so the reference is content-addressed (DOM-032). The
// digest is a one-way hash and is not itself personal data.
export interface PersonalDataRef {
  subjectId: string
  ciphertext: string // base64
  iv: string // base64
  tag: string // base64 (GCM auth tag)
  digest: string // sha256 of the plaintext, hex
  sealedAt: string
}

export type OpenResult =
  | { status: 'ok'; value: string }
  | { status: 'erased' } // key destroyed — permanently unrecoverable (the tombstone)
  | { status: 'no-key' } // never sealed / no key yet

export function sealPersonalData(
  keys: SubjectKeyRegistry,
  subjectId: string,
  plaintext: string,
  sealedAt: string
): PersonalDataRef {
  const key = keys.ensureKey(subjectId)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    subjectId,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    digest: createHash('sha256').update(plaintext, 'utf8').digest('hex'),
    sealedAt
  }
}

export function openPersonalData(keys: SubjectKeyRegistry, ref: PersonalDataRef): OpenResult {
  const key = keys.getKey(ref.subjectId)
  if (!key) return { status: 'erased' } // key destroyed -> undecryptable by construction
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ref.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(ref.tag, 'base64'))
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ref.ciphertext, 'base64')), decipher.final()])
    return { status: 'ok', value: plaintext.toString('utf8') }
  } catch {
    // A key that cannot open its own ciphertext is a corrupted/rotated state; treat
    // as unrecoverable rather than leaking a partial or throwing into a data path.
    return { status: 'erased' }
  }
}
