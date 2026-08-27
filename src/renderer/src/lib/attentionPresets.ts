// CR-09 D-A — object marking: turning a thing on the canvas into an attention
// item with one deterministic gesture.
//
// "Intelligent" here means the SYSTEM KNOWS WHAT THE THING IS, not that a model
// guessed: a pure table maps widget kind → a title template and a starting
// intent class, and the standard confirm card (DEC-028) shows the result with
// the class pre-picked so one arrow key corrects it. Zero AI, zero latency,
// works with the key removed — Layer 0 by construction (CR-09 §7).
//
// The item POINTS at the object (sourceType/sourceRef, already in the S2 column
// manifest); it never copies it. Attention stays a lens, never the container
// (F006, the standing anti-goal).

export interface AttentionPreset {
  /** Capture text seeded into the confirm card. */
  text: string
  /** The class the card pre-picks; the user can still flip it. */
  intentClass: string
}

const TRIM = 60
const short = (s: string | undefined): string => {
  const t = (s || '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.length > TRIM ? `${t.slice(0, TRIM - 1)}…` : t
}

/**
 * The preset for marking a widget. `kind` is the widget kind; `title` is its
 * own title (or best available label); `text` is any text it carries, used
 * only where the object IS its text (a sticky is its note).
 */
export function presetForWidget(kind: string, title: string, text?: string): AttentionPreset {
  const name = short(title) || short(text) || 'this'
  switch (kind) {
    case 'slack':
    case 'chat':
    case 'mail':
      return { text: `Follow up in ${name}`, intentClass: 'to_respond' }
    case 'sticky':
      // A sticky IS its text — marking it should not rename the thought.
      return { text: short(text) || name, intentClass: 'to_remember' }
    case 'page':
    case 'note':
    case 'markdown':
    case 'document':
      return { text: `Review ${name}`, intentClass: 'to_review' }
    case 'table':
      return { text: `Update ${name}`, intentClass: 'to_do' }
    case 'webview':
    case 'browser':
      return { text: `Check ${name}`, intentClass: 'to_review' }
    case 'agent':
    case 'automation':
      return { text: `Check on ${name}`, intentClass: 'to_review' }
    case 'mindmap':
    case 'diagram':
      return { text: `Work through ${name}`, intentClass: 'to_do' }
    case 'calendar':
    case 'timer':
      return { text: `Schedule ${name}`, intentClass: 'to_meet' }
    default:
      return { text: `Attend to ${name}`, intentClass: 'to_do' }
  }
}

/** Marking a whole desk from its own menu (CR-09 Q3): an ITEM that references
 *  the desk — never a feeder (those stay computed) and never a plan. */
export function presetForDesk(title: string): AttentionPreset {
  return { text: `Attend to ${short(title) || 'this desk'}`, intentClass: 'to_do' }
}

/** Marking several objects at once: one item that names the count, so the
 *  queue never fills with N near-identical rows from one gesture. */
export function presetForMulti(count: number, deskTitle?: string): AttentionPreset {
  const where = short(deskTitle || '')
  return {
    text: `Attend to ${count} items${where ? ` on ${where}` : ''}`,
    intentClass: 'to_do'
  }
}
