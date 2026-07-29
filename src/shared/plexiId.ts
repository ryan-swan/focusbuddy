// PLX-DOM-010: entity identifiers MUST be client-generable and time-ordered
// (UUIDv7), NOT random UUIDv4. Time-ordered ids give locality (index/storage
// friendliness), natural creation ordering without a separate timestamp, and
// clean offline reconciliation, which is why the spec forbids v4.
//
// This is the single generator all new ids route through. Existing v4 ids remain
// valid; migrating call sites away from crypto.randomUUID() is a separate,
// staged change (see the ADR on new-ids-only vs backfill). Works in both the
// main (Node) and renderer (browser) processes via the Web Crypto API.

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  ;(globalThis.crypto as Crypto).getRandomValues(b)
  return b
}

// Monotonic sub-millisecond ordering: ids minted within the same millisecond use
// an incrementing 12-bit counter (rand_a) so lexicographic order still matches
// mint order. On counter overflow we borrow from the next millisecond.
let _lastMs = -1
let _seq = 0

const byte = (v: number, shift: number): number => Math.floor(v / 2 ** shift) % 256

/**
 * Generate a UUIDv7 string. Pass `nowMs` only in tests for deterministic output.
 */
export function plexiId(nowMs?: number): string {
  let ms = nowMs ?? Date.now()
  if (ms === _lastMs) {
    _seq++
    if (_seq > 0xfff) {
      // Counter exhausted for this millisecond; advance the clock field.
      ms = _lastMs + 1
      _lastMs = ms
      _seq = 0
    }
  } else {
    _lastMs = ms
    _seq = 0
  }

  const b = new Uint8Array(16)
  // 48-bit big-endian millisecond timestamp.
  b[0] = byte(ms, 40)
  b[1] = byte(ms, 32)
  b[2] = byte(ms, 24)
  b[3] = byte(ms, 16)
  b[4] = byte(ms, 8)
  b[5] = ms % 256
  // Version (7) in the high nibble of byte 6, then the 12-bit monotonic counter.
  b[6] = 0x70 | ((_seq >> 8) & 0x0f)
  b[7] = _seq & 0xff
  // Variant (10xx) in byte 8, then 62 bits of randomness.
  const r = randomBytes(8)
  b[8] = 0x80 | (r[0] & 0x3f)
  b[9] = r[1]
  b[10] = r[2]
  b[11] = r[3]
  b[12] = r[4]
  b[13] = r[5]
  b[14] = r[6]
  b[15] = r[7]

  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** True if `id` is a well-formed UUIDv7 (version nibble 7, variant 8..b). */
export function isUuidV7(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

/** Extract the 48-bit millisecond timestamp embedded in a UUIDv7. */
export function timestampOf(id: string): number {
  const hex = id.replace(/-/g, '').slice(0, 12)
  return parseInt(hex, 16)
}
