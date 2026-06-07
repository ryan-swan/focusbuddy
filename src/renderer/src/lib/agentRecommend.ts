import type { AgentProfile } from './agentProfiles'

// Lightweight, local agent-recommendation engine. Given the instruction a user
// is giving a desk agent, it scores every available profile against the text and
// returns a clearly-better-fitting role, or null. It is intentionally instant
// and free (no model call) so it can run as the user types without ever getting
// in the way — a suggestion, never a gate. The smarter "design a brand-new
// specialist" path is AI-backed and only runs when the user asks for it.

const STOP = new Set([
  'this', 'that', 'with', 'from', 'into', 'your', 'their', 'about', 'have', 'will', 'would',
  'should', 'could', 'make', 'need', 'want', 'please', 'some', 'they', 'them', 'then', 'than',
  'what', 'when', 'which', 'where', 'using', 'over', 'each', 'also', 'just', 'them', 'these',
  'those', 'here', 'there', 'every', 'onto', 'been', 'being', 'does', 'done', 'such'
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
}

function scoreProfile(words: string[], p: AgentProfile): number {
  // Name + blurb are weighted heavier (the essence of the role) than the body.
  const strong = `${p.name} ${p.blurb}`.toLowerCase()
  const weak = (p.systemPrompt || '').toLowerCase()
  let s = 0
  const seen = new Set<string>()
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    if (strong.includes(w)) s += 2
    else if (weak.includes(w)) s += 1
  }
  return s
}

export interface ProfileSuggestion {
  id: string
  name: string
  blurb: string
}

// Returns a better-fitting profile than the current one, or null. Conservative
// on purpose: it only speaks up when the best match is meaningfully stronger
// than the role already selected, so it doesn't nag.
export function recommendProfileLocal(
  instruction: string,
  currentId: string | undefined,
  profiles: AgentProfile[]
): ProfileSuggestion | null {
  const words = tokens(instruction)
  if (words.length < 3) return null

  let best: AgentProfile | null = null
  let bestScore = 0
  for (const p of profiles) {
    const s = scoreProfile(words, p)
    if (s > bestScore) {
      bestScore = s
      best = p
    }
  }
  if (!best || best.id === currentId) return null

  const current = currentId ? profiles.find((p) => p.id === currentId) : undefined
  const currentScore = current ? scoreProfile(words, current) : 0

  // Speak up only when clearly better than what's selected.
  if (bestScore < 4 || bestScore < currentScore + 3) return null
  return { id: best.id, name: best.name, blurb: best.blurb }
}
