// Pull the first usable http(s) URL out of dropped drag data. A text/uri-list
// payload (what a tab or link dragged from a browser provides) can hold several
// lines plus comment lines that start with '#'; a text/plain payload is usually
// a single URL. We only accept explicit http(s) so dropping arbitrary selected
// text does not spawn a browser widget. Kept in its own module so it stays pure
// and unit-testable, away from Canvas.tsx's heavy import graph.
export function firstHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    if (/^https?:\/\//i.test(s)) return s
  }
  return null
}
