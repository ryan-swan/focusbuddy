// The omnibar's intent router (A2, AI-01, R11) — pure, so the routing rules
// are unit-locked. Given what the user typed and the workspace's navigable
// targets, produce the ORDERED intents the bar may commit: the first is what
// Enter does, Tab steps through the rest (R11: the bar never guesses
// silently — it always shows what Enter will do before it does it).

export type OmniIntentKind = 'url' | 'search' | 'ask' | 'goto'

export interface OmniTarget {
  // 'page' is a fixed surface (Home, Tasks, Calendar…); the rest are ids.
  kind: 'page' | 'desk' | 'document'
  id: string
  title: string
}

export interface OmniIntent {
  kind: OmniIntentKind
  // What Enter will do, in the bar's own words ("Open plexi.so", "Search the
  // web", "Ask Plexii", "Go to Wedding desk").
  label: string
  // url: the normalised address. goto: the matched target.
  url?: string
  target?: OmniTarget
}

// A bare token that reads as a web address: dots between word chars and a
// plausible TLD, no spaces. "plexi.so", "www.figma.com/files", "x.com/foo?q=1".
const DOMAIN_RE = /^(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,12}(?::\d+)?(?:[/?#]\S*)?$/i

const QUESTION_START =
  /^(how|why|what|whats|what's|when|where|who|whos|who's|which|can|could|should|would|will|do|does|did|is|are|was|were|am|help)\b/i
// Verbs that address the assistant: the user is asking for work, not a page.
const ASK_VERBS =
  /^(write|draft|summarize|summarise|plan|create|make|build|generate|explain|compare|translate|rewrite|brainstorm|outline|analyze|analyse|review|find me|give me|show me|tell me|remind me)\b/i
const GOTO_PREFIX = /^(take me to|go to|open|show|goto)\s+(.+)$/i

export function normalizeUrl(raw: string): string {
  const t = raw.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

// Case-insensitive containment match against the target titles, best first:
// exact > starts-with > contains. Ties break toward shorter titles (the
// tighter name is the likelier destination).
export function matchTargets(text: string, targets: OmniTarget[], limit = 3): OmniTarget[] {
  const q = text.trim().toLowerCase()
  if (!q) return []
  const scored = targets
    .map((t) => {
      const title = t.title.trim().toLowerCase()
      if (!title) return null
      let score = 0
      if (title === q) score = 3
      else if (title.startsWith(q) || q.startsWith(title)) score = 2
      else if (title.includes(q) || q.includes(title)) score = 1
      if (score === 0) return null
      return { t, score, len: title.length }
    })
    .filter((x): x is { t: OmniTarget; score: number; len: number } => x !== null)
    .sort((a, b) => b.score - a.score || a.len - b.len)
  return scored.slice(0, limit).map((x) => x.t)
}

function urlIntent(text: string): OmniIntent {
  const host = text.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]
  return { kind: 'url', label: `Open ${host}`, url: normalizeUrl(text) }
}

function searchIntent(text: string): OmniIntent {
  return { kind: 'search', label: 'Search the web', url: text }
}

function askIntent(): OmniIntent {
  return { kind: 'ask', label: 'Ask Plexii' }
}

function gotoIntent(target: OmniTarget): OmniIntent {
  // Name the kind, but never stutter: "Wedding desk" already says desk.
  const noun = target.kind === 'desk' && !/\bdesk\s*$/i.test(target.title) ? ' desk' : ''
  return { kind: 'goto', label: `Go to ${target.title}${noun}`, target }
}

// The ordered intents for this input. Deterministic and total: anything
// non-empty yields at least [search, ask].
export function classifyOmniInput(rawInput: string, targets: OmniTarget[]): OmniIntent[] {
  const text = rawInput.trim()
  if (!text) return []
  const out: OmniIntent[] = []
  const push = (i: OmniIntent): void => {
    if (!out.some((o) => o.kind === i.kind && o.target?.id === i.target?.id)) out.push(i)
  }

  // An address is unambiguous: no spaces, domain-shaped.
  if (!/\s/.test(text) && DOMAIN_RE.test(text)) {
    push(urlIntent(text))
    push(searchIntent(text))
    push(askIntent())
    return out
  }

  // "take me to X" / "go to X" / "open X": navigation first when X names
  // something real; otherwise the phrase falls through to the general rules
  // ("open a savings account" is a question, not a dead nav attempt).
  const go = text.match(GOTO_PREFIX)
  if (go) {
    const matched = matchTargets(go[2], targets)
    if (/\s/.test(go[2]) === false && DOMAIN_RE.test(go[2])) {
      push(urlIntent(go[2]))
    }
    for (const m of matched) push(gotoIntent(m))
    if (out.length > 0) {
      push(askIntent())
      push(searchIntent(text))
      return out
    }
  }

  const question = /\?\s*$/.test(text) || QUESTION_START.test(text) || ASK_VERBS.test(text)
  // A bare phrase that exactly names a workspace thing offers navigation
  // high; otherwise search leads for phrases, Plexii leads for questions.
  const named = matchTargets(text, targets, 1)
  if (question) {
    push(askIntent())
    push(searchIntent(text))
  } else {
    if (named.length > 0 && named[0].title.trim().toLowerCase() === text.toLowerCase()) {
      push(gotoIntent(named[0]))
    }
    push(searchIntent(text))
    push(askIntent())
    if (named.length > 0) push(gotoIntent(named[0]))
  }
  return out
}

// The composer's door (A2, AI-01 — the mascot side of "one door"; Caleb's
// omni-aware-composer pick + the instant-web ruling, both 2026-08-23).
// Deterministic intents NEVER wait on the model: a bare address opens, and a
// navigation phrase ("take me to / go to X") whose X is not in the workspace
// acts on the web IMMEDIATELY — that phrase always means "get me there", and
// an 11-second AI turn ending in a proposal card is the clunk Caleb rejected.
// Chat protection: questions and work requests grow no chrome; softer verbs
// ("open/show X") that match nothing stay chat-led ("open a savings account"
// is advice-seeking, not navigation); and mid-conversation, short phrases
// stay chat-led too so "sounds good" is never hijacked into a web search —
// on a FRESH conversation the same phrase is searchy and search leads.
// Returns the ordered intents (first = what Enter does), or [] for pure chat.
export function composerOmniIntents(
  rawInput: string,
  targets: OmniTarget[],
  opts: { chatFirst?: boolean } = {}
): OmniIntent[] {
  const text = rawInput.trim()
  // Multiline or long input is a composed message, never a command.
  if (!text || /\n/.test(text) || text.length > 160) return []

  if (!/\s/.test(text) && DOMAIN_RE.test(text)) {
    return [urlIntent(text), askIntent()]
  }

  const go = text.match(GOTO_PREFIX)
  if (go) {
    const out: OmniIntent[] = []
    if (!/\s/.test(go[2]) && DOMAIN_RE.test(go[2])) out.push(urlIntent(go[2]))
    for (const m of matchTargets(go[2], targets, 2)) out.push(gotoIntent(m))
    if (out.length > 0) {
      out.push(askIntent())
      return out
    }
    // Explicit navigation verbs that matched nothing local mean the WEB, now:
    // "take me to buffalo wild wings menu" searches the named thing
    // instantly. Softer verbs (open/show) fall through to the chat rules.
    if (/^(take me to|go to|goto)\b/i.test(text)) {
      return [searchIntent(go[2]), askIntent()]
    }
  }

  if (/\?\s*$/.test(text) || QUESTION_START.test(text) || ASK_VERBS.test(text)) return []

  // A short bare phrase reads searchy. On a fresh conversation the web leads
  // (the instant ruling); mid-conversation chat leads, because short phrases
  // there are usually replies — the web stays one Tab away either way.
  if (text.split(/\s+/).length <= 6) {
    return opts.chatFirst
      ? [askIntent(), searchIntent(text)]
      : [searchIntent(text), askIntent()]
  }
  return []
}

// The search engines the omnibar can hand a query to (AI-02 seeds). Keyless:
// these are result-page URLs for the in-app browser panel, not APIs.
export const SEARCH_ENGINES = [
  { id: 'duckduckgo', label: 'DuckDuckGo', url: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  { id: 'google', label: 'Google', url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'bing', label: 'Bing', url: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'brave', label: 'Brave Search', url: (q: string) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  { id: 'perplexity', label: 'Perplexity', url: (q: string) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}` }
] as const

export type SearchEngineId = (typeof SEARCH_ENGINES)[number]['id']

export function searchUrl(engine: SearchEngineId, query: string): string {
  const e = SEARCH_ENGINES.find((s) => s.id === engine) ?? SEARCH_ENGINES[0]
  return e.url(query)
}
