// Turn-level retrieval gating (A4, AI-10).
//
// Until A4, every substantive chat turn ran workspace retrieval and web search
// ceremonially — right for grounded question-answering, wrong for discovery
// ideation, where the user is answering Plexii's questions ("something calm
// and minimal", a tapped choice) and a full search of the workspace plus the
// web on every such reply is pure theatre. R8's discovery posture makes those
// turns the COMMON case, so the ceremony gates here.
//
// The rules are deterministic and unit-locked, in the R15 spirit: normal chat
// is untouched (retrieval is the assistant's grounding — A2 built it), and a
// discovery turn searches only when something real points at the workspace —
// the seed (first turn), an @-mention, a genuine question, or words that
// reference what the user already has. Everything else is ideation and skips
// both pools. The trace stays honest either way: a gated turn draws no search
// line at all (see traceView), never an empty "searched" claim.
//
// Web search additionally honours the conversation's R21 globe toggle
// (ChatRequest.webSearch; absent means on, so every old caller is untouched).
//
// Dependency-free so it unit-tests in isolation, same policy as
// discoveryMode.ts and chatUiBlocks.ts.

import type { AiChatMode } from '@shared/types'

export interface TurnRetrievalDecision {
  workspace: boolean
  web: boolean
  // Why the decision fell the way it did. For tests and logs, never user copy.
  reason:
    | 'chat-mode'
    | 'mentions'
    | 'seed'
    | 'question'
    | 'workspace-signals'
    | 'ideation'
}

// Words that reference material the user already has. Deliberately generous:
// grounding a turn that mentions "my sister's wedding" can genuinely find the
// wedding desk (discovery rule 5 — build on what they have). The turns this
// must NOT match are pure ideation replies: preferences, adjectives, tapped
// choice options.
const WORKSPACE_SIGNALS =
  /\b(?:my|our|we (?:have|use|already)|already have|existing|workspace|desks?|docs?|documents?|notes?|files?|tables?|widgets?|plexibrain|knowledge base)\b/i

// A turn that is genuinely asking something. Interrogative lead or a closing
// question mark — either earns grounding even mid-discovery.
const QUESTION_LEAD =
  /^(?:what|what's|how|why|when|where|who|which|can|could|should|would|will|do|does|did|is|are|was|were)\b/i

export function isQuestionTurn(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/\?\s*$/.test(t)) return true
  return QUESTION_LEAD.test(t)
}

export function turnRetrieval(opts: {
  mode?: AiChatMode
  text: string
  // True when this is the conversation's first user turn — the discovery seed
  // always grounds itself in the workspace.
  isFirstUserTurn: boolean
  // True when the turn carries admitted @-mentions: the user pointed at their
  // own material, so retrieval (which mentions narrow) must run.
  hasMentions: boolean
  // The conversation's R21 web toggle. True unless the user turned it off.
  webEnabled: boolean
}): TurnRetrievalDecision {
  const web = opts.webEnabled
  if (opts.mode !== 'discovery') {
    return { workspace: true, web, reason: 'chat-mode' }
  }
  const text = opts.text.trim()
  if (opts.hasMentions) return { workspace: true, web, reason: 'mentions' }
  if (opts.isFirstUserTurn) return { workspace: true, web, reason: 'seed' }
  if (isQuestionTurn(text)) return { workspace: true, web, reason: 'question' }
  if (WORKSPACE_SIGNALS.test(text)) {
    return { workspace: true, web, reason: 'workspace-signals' }
  }
  // An ideation reply: no search of any kind. The web gate rides along even
  // when the globe is on — the ceremony being killed is BOTH pools.
  return { workspace: false, web: false, reason: 'ideation' }
}
