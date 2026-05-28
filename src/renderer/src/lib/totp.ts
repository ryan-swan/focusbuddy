// RFC 6238 TOTP — generates 6-digit codes from a base32 shared secret.
// Pure browser/Web-Crypto implementation, no third-party dependencies.

function base32Decode(secret: string): Uint8Array {
  // Strip whitespace and pad chars, uppercase
  const cleaned = secret.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase()
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) continue // skip invalid char
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return new Uint8Array(bytes)
}

function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8)
  // JS bitwise ops are 32-bit; pack the high then low half
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  buf[0] = (high >>> 24) & 0xff
  buf[1] = (high >>> 16) & 0xff
  buf[2] = (high >>> 8) & 0xff
  buf[3] = high & 0xff
  buf[4] = (low >>> 24) & 0xff
  buf[5] = (low >>> 16) & 0xff
  buf[6] = (low >>> 8) & 0xff
  buf[7] = low & 0xff
  return buf
}

export async function generateTotp(
  secret: string,
  digits = 6,
  periodSec = 30,
  nowMs: number = Date.now()
): Promise<{ code: string; remainingSec: number } | null> {
  try {
    const keyBytes = base32Decode(secret)
    if (keyBytes.length === 0) return null
    const counter = Math.floor(nowMs / 1000 / periodSec)
    const msg = counterBytes(counter)

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )
    const sigBuf = await crypto.subtle.sign('HMAC', key, msg as BufferSource)
    const sig = new Uint8Array(sigBuf)

    // Dynamic truncation per RFC 4226
    const offset = sig[sig.length - 1] & 0x0f
    const binCode =
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)
    const mod = 10 ** digits
    const code = (binCode % mod).toString().padStart(digits, '0')
    const remainingSec = periodSec - Math.floor((nowMs / 1000) % periodSec)
    return { code, remainingSec }
  } catch {
    return null
  }
}

// Quick sanity check — used by the entry form to reject invalid secrets up front
export function looksLikeTotpSecret(secret: string): boolean {
  const cleaned = secret.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase()
  if (cleaned.length < 16) return false
  return /^[A-Z2-7]+$/.test(cleaned)
}
