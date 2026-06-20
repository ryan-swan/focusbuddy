// Parse the rows matrix out of a Sheets AI-fill reply. Dependency-free + pure so
// it can be unit-tested without the Anthropic SDK. Tolerates BOTH the requested
// object form {"rows": [[...]]} and a bare top-level array [[...]] (models often
// return the matrix directly), plus a stray ```json fence. Returns null when
// there's no usable array, so the caller shows a clear message instead of the
// generic "No JSON object in response".
export function parseSheetRows(text: string): string[][] | null {
  let s = (text ?? '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  const candidates: string[] = []
  // Try both bracket forms so a truncated object can still fall back to a bare
  // array, and a bare array is accepted directly.
  if (objStart !== -1) {
    const end = s.lastIndexOf('}')
    if (end > objStart) candidates.push(s.slice(objStart, end + 1))
  }
  if (arrStart !== -1) {
    const end = s.lastIndexOf(']')
    if (end > arrStart) candidates.push(s.slice(arrStart, end + 1))
  }
  for (const cand of candidates) {
    let parsed: unknown
    try {
      parsed = JSON.parse(cand)
    } catch {
      continue
    }
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? (parsed as { rows?: unknown }).rows
        : null
    if (Array.isArray(rows)) {
      const matrix = rows
        .filter(Array.isArray)
        .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
      if (matrix.length) return matrix
    }
  }
  return null
}
