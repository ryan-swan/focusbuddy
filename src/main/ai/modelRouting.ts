import type { AIPurpose, ModelMode } from '@shared/types'

// Model IDs — kept in main process so renderer never sees raw IDs.
const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-8'

// Auto-mode routing table. Each purpose gets the cheapest model that meets the
// quality bar for that task. Override these with caution — tighter routing
// directly affects user cost without much quality gain in most cases.
const AUTO_ROUTING: Record<AIPurpose, string> = {
  chat: SONNET, // conversational reasoning is the workhorse use case
  welcome: SONNET, // a sharp opening matters; runs once per task activation
  setup: SONNET, // widget suggestions need good judgement
  resume: SONNET, // resume drafting is quality-sensitive (user reads it back)
  trail_summary: HAIKU, // pure summarization — Haiku is plenty
  body_double: HAIKU, // tiny presence messages every ~10 min — Haiku is right
  smart_stack: SONNET, // semantic grouping needs reasoning about relationships
  // Living pages: cheap synthesis that re-runs on every meaningful canvas
  // change. Haiku is right unless the user explicitly opts into a stronger
  // model via global model-mode override.
  living_page: HAIKU,
  // Transform wires fire reactively whenever a wired source changes, so they
  // must be cheap by default. Haiku handles "summarize / extract / rewrite"
  // verbs well; the global model-mode override still applies.
  wire_transform: HAIKU,
  // Desk agents reason over MULTIPLE wired inputs against a standing
  // instruction — that judgement benefits from Sonnet. Runs are user-triggered
  // or interval-throttled (min 30s), not per-keystroke, so the cost is bounded.
  desk_agent: SONNET,
  // The command bar's intent router — a tight classify into one of four shapes,
  // returning a small JSON object. Haiku is fast and plenty for classification,
  // and this fires on every command-bar submit, so cheap matters.
  command_route: HAIKU,
  // Office-document generation (the "Create with AI" flow for docs, sheets and
  // slides). The user reads and then edits the result, so quality matters;
  // Sonnet is the right default, with the global model-mode override available.
  document: SONNET,
  // In-editor doc AI: drafting formatted content and rewriting a selection. The
  // user reads a preview and then commits it into a document they care about, so
  // quality matters; Sonnet is the right default.
  doc_rewrite: SONNET,
  // Building a writing-style profile from the user's Sent folder is pure pattern
  // extraction from text — Haiku is purpose-built for it and runs once per
  // session, cached thereafter.
  tone_profile: HAIKU,
  // Drafting an email reply in the user's voice has to hold two constraints at
  // once: match the voice faithfully AND never fabricate facts, dates or
  // commitments. That instruction-following discipline wants Sonnet.
  email_reply_draft: SONNET,
  // Auto-filing tag suggestions: a cheap, frequent classification returning a
  // small JSON list of tags. Haiku is fast and plenty, and this can fire as
  // files arrive, so cheap matters.
  file_tag: HAIKU,
  // End-of-meeting wrap-up: summarise a whole conversation AND propose the
  // deliverables that came out of it. Both halves are quality-sensitive and the
  // user reads them back, so Sonnet is the right default. Runs once per meeting.
  meeting_end: SONNET
}

let currentMode: ModelMode = 'auto'

export function setModelMode(mode: ModelMode): void {
  currentMode = mode
}

export function getModelMode(): ModelMode {
  return currentMode
}

export function resolveModel(purpose: AIPurpose): string {
  switch (currentMode) {
    case 'haiku':
      return HAIKU
    case 'sonnet':
      return SONNET
    case 'opus':
      return OPUS
    case 'auto':
    default:
      return AUTO_ROUTING[purpose]
  }
}
