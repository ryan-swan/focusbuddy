// Share-link token utilities. Tokens are opaque, URL-safe, and long enough
// that brute-forcing the share namespace is impractical. v1 generates them
// locally; when the production server lands the same token format is what
// goes into the URL path so URLs minted in local-mock mode survive the
// transition.

// 96 bits of entropy (16 base32 chars). 32^16 = ~10^24 — astronomically
// safe against guessing within any human-lifetime URL space.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

export function generateShareToken(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length]
  }
  return out
}

// The viewer URL — points at the future hosted viewer. In local-mock mode
// the URL is "informational" (copies to clipboard, but won't resolve until
// the server ships). The format is finalised now so links shared today
// continue to work later.
export function viewerUrlFor(token: string): string {
  return `https://fb.app/share/${token}`
}
