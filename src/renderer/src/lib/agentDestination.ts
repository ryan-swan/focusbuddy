import type { Widget, WidgetKind, ActionProposal } from '@shared/types'

// Where a desk agent may put its output, and what that delivery looks like.
//
// The review found that wiring an agent to a widget only ever supplied a FORMAT
// HINT to the model. Nothing delivered anything: the output landed in the target
// only if the model spontaneously proposed an update-widget for it. This module
// makes the destination explicit and the delivery deterministic — the card is
// always offered, so the only variable left is whether the human accepts it.

// The kinds that can meaningfully receive written output. Deliberately a
// allowlist rather than "anything with a content field": a timer or a colour
// swatch has a content string too, and offering them as destinations would be
// offering nonsense. Mirrors the formats the agent prompt already describes.
export const AGENT_DESTINATION_KINDS: readonly WidgetKind[] = [
  'page',
  'markdown',
  'note',
  'sticky',
  'card',
  'scratchpad',
  'living-doc',
  'table',
  'mindmap',
  'field'
] as const

export function canReceiveAgentOutput(kind: WidgetKind): boolean {
  return AGENT_DESTINATION_KINDS.includes(kind)
}

// What the agent should be told to WRITE for each destination, so the output
// arrives in the shape the widget can actually hold. Kept beside the allowlist
// so adding a destination kind and forgetting its format is impossible.
export function destinationFormat(kind: WidgetKind): string {
  switch (kind) {
    case 'page':
    case 'living-doc':
      return 'a document written in Markdown (headings, bullet lists, paragraphs)'
    case 'markdown':
      return 'Markdown'
    case 'card':
      return 'a short title on the first line, then the body'
    case 'table':
      return 'a list of items, one per line (the app turns them into typed table rows)'
    case 'mindmap':
      return 'an outline: the first line is the root, then one item per line'
    case 'field':
      return 'a single short value'
    default:
      return 'plain text'
  }
}

/** A human label for the destination row, e.g. 'Page "Weekly brief"'. */
export function destinationLabel(w: Widget): string {
  const kind = w.kind.charAt(0).toUpperCase() + w.kind.slice(1)
  return w.title?.trim() ? `${kind} "${w.title.trim()}"` : kind
}

/** The widgets on this desk that could receive this agent's output. */
export function eligibleDestinations(widgets: Widget[], taskId: string, agentId: string): Widget[] {
  return widgets
    .filter((w) => w.taskId === taskId && w.id !== agentId && !w.archived && canReceiveAgentOutput(w.kind))
    .sort((a, b) => (a.title || a.kind).localeCompare(b.title || b.kind))
}

// Phrases that mean the agent REPORTED on its work instead of doing it.
//
// From a real failure: an agent replied "I've written a 7-touch early adopter
// sequence ... and saved to the linked page", and that sentence is what landed
// in the page. The prompt now forbids this, but a prompt is a request; writing a
// claim into the user's document is not a failure mode worth leaving to chance.
//
// A save claim is treated as conclusive at any length — a genuine document has
// no reason to announce where it was filed. A completion claim is only treated
// as narration when the whole reply is SHORT, because a real artefact can open
// with "I've written to you before" and must not be thrown away for it.
const SAVE_CLAIM = /\b(saved|written|added|posted|placed)\s+(it\s+)?(to|into|in)\s+the\s+(linked\s+)?(page|widget|document|note|doc|table)\b/i
const COMPLETION_OPENER = /^\s*(?:I(?:'ve| have)\s+(?:written|drafted|created|prepared|put together|added|updated)|Drafted|Created|Here(?:'s| is)\s+(?:a|the|your))\b/i
const NARRATION_MAX_CHARS = 400

/** True when the text is the agent talking about the work rather than the work. */
export function looksLikeNarration(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (SAVE_CLAIM.test(t)) return true
  return t.length < NARRATION_MAX_CHARS && COMPLETION_OPENER.test(t)
}

export type DeliveryOutcome =
  | { ok: true; proposal: ActionProposal }
  | { ok: false; reason: 'empty' | 'narration' }

/**
 * The delivery card for one run.
 *
 * Refuses in two cases, both of which would otherwise damage the destination:
 * an empty run (which must never replace real content), and a run that described
 * its work instead of producing it (which would file the description as the work).
 */
export function buildDelivery(
  output: string,
  target: Widget,
  mode: 'append' | 'replace',
  agentTitle: string
): DeliveryOutcome {
  const text = output.trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (looksLikeNarration(text)) return { ok: false, reason: 'narration' }
  const p = buildDeliveryProposal(text, target, mode, agentTitle)
  return p ? { ok: true, proposal: p } : { ok: false, reason: 'empty' }
}

/**
 * The raw card, with no judgement about the content. Kept separate so the
 * refusal rules above are the only place that decides what not to deliver.
 */
export function buildDeliveryProposal(
  output: string,
  target: Widget,
  mode: 'append' | 'replace',
  agentTitle: string
): ActionProposal | null {
  const text = output.trim()
  if (!text) return null
  // A field holds ONE value. Appending to it would concatenate every run into
  // nonsense, so the target's nature overrides the preference here — the only
  // case where it does.
  const effectiveMode = target.kind === 'field' ? 'replace' : mode
  // `label` is REQUIRED on update-widget and drives the card's subject line. It
  // was missing here behind an `as ActionProposal` cast, so the delivery card
  // rendered with an empty subject and nothing to review — which is precisely
  // what made the apply step feel like ceremony. No cast now: if the shape is
  // wrong, it fails to compile.
  const proposal: Extract<ActionProposal, { kind: 'update-widget' }> = {
    kind: 'update-widget',
    id: `agent-delivery-${target.id}-${Date.now()}`,
    widgetId: target.id,
    label: destinationLabel(target),
    content: text,
    operation: effectiveMode,
    reason: `${agentTitle || 'This agent'} → ${destinationLabel(target)}`
  }
  return proposal
}
