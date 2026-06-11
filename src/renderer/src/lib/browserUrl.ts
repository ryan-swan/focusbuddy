// Address-bar input handling for the browser widget. Turns whatever the user
// types into something to load: a real address is navigated to, and anything
// that is plainly a search runs as a Google search instead of routing to a
// broken, percent-encoded page. Kept pure and separate from the component so
// the URL-versus-search decision is unit-testable.

// A Google search for free-text the user typed into the address bar.
export function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

// Does this string look like a host the user means to visit, rather than a
// search? Mirrors a browser omnibox: anything with whitespace is a search, a
// bare word with no dot is a search, but localhost, an IP, a port, or a dotted
// hostname with a real-looking TLD is a navigation.
export function looksLikeHost(input: string): boolean {
  if (/\s/.test(input)) return false
  const afterScheme = input.replace(/^[a-z]+:\/\//i, '')
  const host = afterScheme.split(/[/?#]/)[0].split('@').pop() ?? ''
  const hostname = host.split(':')[0]
  if (!hostname) return false
  if (hostname === 'localhost') return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true // IPv4
  if (hostname.includes(':') && /^\[?[0-9a-f:]+\]?$/i.test(hostname)) return true // IPv6
  return /\.[a-z]{2,}$/i.test(hostname) // dotted host ending in a TLD-like label
}

// Turn whatever the user typed into a URL to load. Returns null only for empty
// input; every other input resolves either to a real address or to a search.
export function normalizeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  // Respect an explicit scheme. If it is a valid URL, use it; if the user typed
  // a scheme but then something unparseable, fall back to a search.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(about|data|view-source|mailto):/i.test(raw)) {
    try {
      return new URL(raw).toString()
    } catch {
      return searchUrl(raw)
    }
  }
  if (looksLikeHost(raw)) {
    try {
      return new URL(`https://${raw}`).toString()
    } catch {
      // Looked host-like but would not parse; treat it as a search.
    }
  }
  return searchUrl(raw)
}
