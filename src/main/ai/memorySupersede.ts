// The supersession rule (A5, #25 — ruling R23: newest wins, history kept).
//
// "Prefers Tuesday standups" and "prefers Thursday standups" must not both
// stay active and both get injected — the canonical #25 defect. A new memory
// supersedes an old one when they are recognisably the SAME statement with a
// changed detail, decided deterministically:
//
//   same kind, same subject (both possibly empty), and the two texts share
//   enough content-word core: at least two common tokens covering at least
//   two thirds of the smaller text.
//
// Deliberately conservative in both directions: "Caleb works at AAS" never
// supersedes "Caleb prefers dark mode" (same subject, disjoint core), and
// "likes coffee" never supersedes "likes tea" (one common token is not a
// shared statement). What this rule misses stays active — a stale-but-unpaired
// memory is a lesser evil than a silently killed true one.
//
// Dependency-free so it unit-tests in isolation, the lane's standing policy.

const AUX = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'will', 'would', 'shall', 'should', 'has', 'have', 'had', 'do', 'does',
  'did', 'that', 'this', 'these', 'those', 'it', 'its', 'their', 'his',
  'her', 'my', 'our', 'your'
])

function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const t of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (t && !AUX.has(t)) out.add(t)
  }
  return out
}

function normSubject(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function memorySupersedes(
  next: { kind: string; text: string; subject: string },
  prior: { kind: string; text: string; subject: string }
): boolean {
  if (next.kind !== prior.kind) return false
  if (normSubject(next.subject) !== normSubject(prior.subject)) return false
  const a = contentTokens(next.text)
  const b = contentTokens(prior.text)
  if (a.size === 0 || b.size === 0) return false
  let common = 0
  for (const t of a) if (b.has(t)) common++
  const min = Math.min(a.size, b.size)
  // ≥ two common content words AND ≥ 2/3 coverage of the smaller statement.
  return common >= 2 && common * 3 >= min * 2
}
